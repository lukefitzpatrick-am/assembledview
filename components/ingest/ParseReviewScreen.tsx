"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { LoadingState } from "@/components/ui/states"
import type { IngestReviewPackage } from "@/lib/mediaplans/ingest/buildIngestReview"
import { getControlledVocabulary } from "@/lib/mediaplans/ingest/controlledVocabularies"
import {
  leftoverExcludedLegend,
  parseReviewCounts,
  parseReviewLoadGate,
  unresolvedValuesForRow,
} from "@/lib/mediaplans/ingest/parseReview"
import {
  filterParseReviewRows,
  formatParseReviewMoney,
  occupancyScanCopy,
  paidBonusSplit,
  parseReviewRowViews,
  sectionRowsForReview,
  type ParseReviewFilter,
  type ParseReviewRowView,
} from "@/lib/mediaplans/ingest/parseReviewView"
import { writePendingParseReviewLoad } from "@/lib/mediaplans/ingest/pendingParseReviewLoad"
import {
  formatIngestBudget,
  formatIngestConfirmedBlock,
  summariseIngestReview,
  type IngestChatSummary,
} from "@/lib/mediaplans/ingest/summariseIngestReview"
import { AUDIT_RESOLUTION_LABEL, PARSER_RESOLUTION_LABEL } from "@/lib/mediaplans/ingest/lineAuditReconcile"
import { cn } from "@/lib/utils"

type Props = {
  mbaNumber: string
  stageId: string
}

function stateBadge(state: ParseReviewRowView["state"]) {
  switch (state) {
    case "confirmed":
      return <Badge variant="success" size="sm">confirmed</Badge>
    case "excluded":
      return <Badge variant="secondary" size="sm">excluded</Badge>
    case "green_unconfirmed":
      return <Badge variant="info" size="sm">green · unconfirmed</Badge>
    case "value_card":
      return <Badge variant="warning" size="sm">value card</Badge>
    case "waits":
      return <Badge variant="attention" size="sm">waits</Badge>
    default:
      return <Badge variant="warning" size="sm">decide</Badge>
  }
}

export function ParseReviewScreen({ mbaNumber, stageId }: Props) {
  const router = useRouter()
  const [review, setReview] = useState<IngestReviewPackage | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [filter, setFilter] = useState<ParseReviewFilter>("all")
  const [typedByRow, setTypedByRow] = useState<Record<number, string>>({})

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/admin/ingest/stage/${encodeURIComponent(stageId)}`,
      )
      const json = (await res.json()) as {
        review?: IngestReviewPackage
        fileName?: string | null
        error?: string
      }
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      if (!json.review) throw new Error("Staged ingest not found")
      setReview(json.review)
      setFileName(json.fileName ?? json.review.source_file_name ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load the review")
    } finally {
      setLoading(false)
    }
  }, [stageId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const postAction = useCallback(
    async (body: Record<string, unknown>) => {
      setBusy(true)
      setError(null)
      try {
        const res = await fetch("/api/admin/ingest/parse-review", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stageId, mbaNumber, ...body }),
        })
        const json = (await res.json()) as {
          review?: IngestReviewPackage
          error?: string
          channel?: "ooh" | "radio"
          items?: Record<string, unknown>[]
          ingestStageId?: string
          redirectTo?: string
        }
        if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
        if (json.review) setReview(json.review)
        return json
      } catch (e) {
        setError(e instanceof Error ? e.message : "Action failed")
        return null
      } finally {
        setBusy(false)
      }
    },
    [mbaNumber, stageId],
  )

  const summary: IngestChatSummary | null = useMemo(() => {
    if (!review) return null
    return summariseIngestReview(review, { stageId, fileName })
  }, [review, stageId, fileName])

  const counts = review ? parseReviewCounts(review) : null
  const split = review ? paidBonusSplit(review) : { paid: 0, bonus: 0 }
  const sections = review ? sectionRowsForReview(review) : []
  const gate = review ? parseReviewLoadGate(review) : { ok: false as const, reason: "", count: 0 }
  const rows = useMemo(() => {
    if (!review) return []
    return filterParseReviewRows(parseReviewRowViews(review), filter, review)
  }, [review, filter])

  const publisher = review?.detected_publisher ?? "Unknown publisher"
  const campaignLabel =
    mbaNumber === "create" ? "new campaign" : mbaNumber
  const loadCount = counts ? counts.proposed - counts.excluded : 0
  const channelLabel =
    review?.detected_media_type === "radio" ? "Radio" : "OOH"

  const downloadParity = () => {
    if (!summary || !review) return
    const text = formatIngestConfirmedBlock(summary, review)
    const blob = new Blob([text], { type: "text/markdown;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "ingest-parity-report.md"
    a.click()
    URL.revokeObjectURL(url)
  }

  const onLoad = async () => {
    const json = await postAction({ action: "load" })
    if (!json?.items || !json.channel || !json.redirectTo || !json.ingestStageId) {
      return
    }
    writePendingParseReviewLoad({
      channel: json.channel,
      items: json.items,
      replace: true,
      ingestStageId: json.ingestStageId,
    })
    router.push(json.redirectTo)
  }

  if (loading && !review) {
    return <LoadingState />
  }

  if (!review || !summary || !counts) {
    return (
      <div className="rounded-card border border-border bg-card p-6 text-sm text-muted-foreground shadow-e1">
        {error ?? "Staged ingest not found."}
      </div>
    )
  }

  const audit = review.line_audit
  const moneyOk = Math.abs(summary.money_delta ?? 0) < 0.005
  const sectionRecons = review.proposal?.reconciliation.section_reconciliations ?? []
  const sectionsMatch =
    sectionRecons.length === 0 || sectionRecons.every((s) => s.ok)

  return (
    <div className="space-y-4 pb-20">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Parse review · {publisher} → {campaignLabel}
            {mbaNumber !== "create" ? ` (${mbaNumber})` : ""}
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {fileName ?? "workbook"}
            {" · "}
            stage {stageId.slice(0, 8)}
            {" · "}
            profile {publisher}
            {audit
              ? ` · audit: ${audit.model}, ${audit.chunks} section${audit.chunks === 1 ? "" : "s"}`
              : " · audit skipped"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={downloadParity}>
            Download parity report
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => void postAction({ action: "rerun_audit" })}
          >
            Re-run audit
          </Button>
          <Button
            type="button"
            disabled={busy || !gate.ok}
            title={!gate.ok && "reason" in gate ? gate.reason : undefined}
            onClick={() => void onLoad()}
          >
            Load {loadCount} lines into {channelLabel}
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-card border border-border bg-card px-4 py-3 text-sm text-status-critical-fg shadow-e1">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile
          label="Rows scanned"
          value={String(
            (review.proposal?.reconciliation.line_item_count ?? 0) +
              (review.ignored.rows_unparsed_labels?.length ?? 0),
          )}
          detail={occupancyScanCopy(review)}
        />
        <StatTile
          label="Line items proposed"
          value={String(summary.line_item_count)}
          detail={`${split.paid} paid · ${split.bonus} bonus`}
        />
        <StatTile
          label="Line media vs file"
          value={formatIngestBudget(summary)}
          detail={`stated ${formatParseReviewMoney(summary.file_stated_total)} · Δ ${formatParseReviewMoney(summary.money_delta)}`}
          tone={moneyOk ? "ok" : "bad"}
        />
        <StatTile
          label="Rate card · discount"
          value={formatParseReviewMoney(summary.rate_card_total)}
          detail={
            summary.rate_card_discount_pct != null
              ? `${(summary.rate_card_discount_pct * 100).toFixed(1)}% off`
              : "no rate-card column"
          }
        />
        <StatTile
          label="Needs a decision"
          value={String(counts.needs_decision)}
          detail={`${summary.line_item_count - (review.line_audit?.green_count ?? 0)} parser≠audit · unresolved values`}
          tone={counts.needs_decision > 0 ? "warn" : "ok"}
        />
        <StatTile
          label="Confirmed"
          value={`${counts.confirmed} / ${counts.proposed}`}
          detail={`${counts.green_unconfirmed} green not yet ticked`}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        <section className="rounded-card border border-border bg-card p-4 shadow-e1">
          <h2 className="mb-2 text-sm font-semibold text-foreground">
            Three-way reconciliation
          </h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Section</TableHead>
                <TableHead className="text-right">Lines</TableHead>
                <TableHead className="text-right">Line media</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sections.map((s) => (
                <TableRow key={s.section}>
                  <TableCell>{s.section}</TableCell>
                  <TableCell className="num text-right">{s.lines}</TableCell>
                  <TableCell className="num text-right">
                    {formatParseReviewMoney(s.media)}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell className="font-semibold">Total</TableCell>
                <TableCell className="num text-right font-semibold">
                  {summary.line_item_count}
                </TableCell>
                <TableCell className="num text-right font-semibold">
                  {formatParseReviewMoney(summary.total_media_amount)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
          <p className="mt-2 text-xs text-muted-foreground">
            {sectionsMatch ? "sections match" : "section subtotals diverge"}
            {leftoverExcludedLegend(review)
              ? ` · Excluded rows: ${leftoverExcludedLegend(review)}`
              : ""}
          </p>
        </section>
        <section className="rounded-card border border-border bg-card p-4 shadow-e1">
          <h2 className="mb-2 text-sm font-semibold text-foreground">Fields</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>AV field</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Coverage</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(review.template_coverage?.required ?? []).map((f) => {
                const unresolved = (
                  review.template_coverage?.unresolved_controlled ?? []
                ).filter((u) => u.fieldId === f.id)
                const n = summary.line_item_count
                return (
                  <TableRow key={f.id}>
                    <TableCell>{f.label}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {f.source.kind === "header"
                        ? f.source.header
                        : f.source.kind}
                    </TableCell>
                    <TableCell>
                      {unresolved.length > 0 ? (
                        <Badge variant="warning" size="sm">
                          {n - unresolved.length}/{n} · {unresolved[0]?.raw} unresolved
                        </Badge>
                      ) : f.matched ? (
                        <Badge variant="success" size="sm">
                          {n}/{n}
                        </Badge>
                      ) : (
                        <Badge variant="secondary" size="sm">
                          unmatched
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </section>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Show</span>
        {(
          [
            ["all", `All ${counts.proposed}`],
            ["needs_decision", `Needs decision ${counts.needs_decision}`],
            ["green_unconfirmed", `Green, unconfirmed ${counts.green_unconfirmed}`],
            ["bonus", `Bonus ${split.bonus}`],
            ["excluded", `Excluded ${counts.leftover_excluded}`],
          ] as const
        ).map(([id, label]) => (
          <Button
            key={id}
            type="button"
            size="sm"
            variant={filter === id ? "secondary" : "outline"}
            className={cn(filter === id && "border-primary")}
            onClick={() => setFilter(id)}
          >
            {label}
          </Button>
        ))}
        <span className="flex-1" />
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy || counts.green_unconfirmed === 0}
          onClick={() => void postAction({ action: "confirm_all_green" })}
        >
          Confirm all green ({counts.green_unconfirmed})
        </Button>
      </div>

      <section className="overflow-hidden rounded-card border border-border bg-card shadow-e1">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Row</TableHead>
              <TableHead>File says</TableHead>
              <TableHead>Proposed</TableHead>
              <TableHead>Parser vs audit</TableHead>
              <TableHead>State</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow
                key={row.leftover ? `leftover-${row.leftoverLabel}` : row.row}
                className={cn(
                  "interactive-row",
                  row.state === "decide" || row.state === "value_card"
                    ? "bg-pacing-critical-bg/40"
                    : row.state === "waits"
                      ? "bg-pacing-behind-bg/40"
                      : row.state === "excluded"
                        ? "text-muted-foreground"
                        : null,
                )}
              >
                <TableCell className="font-mono text-xs">
                  {row.leftover ? "—" : `r${row.row}`}
                </TableCell>
                <TableCell>
                  <div>{row.fileSays}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {row.fileDetail}
                  </div>
                </TableCell>
                <TableCell>
                  {row.leftover ? (
                    <Badge variant="secondary" size="sm">
                      excluded · leftover
                    </Badge>
                  ) : (
                    <>
                      <div>{row.proposed}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {row.proposedDetail}
                      </div>
                      <div className="num font-semibold">{row.moneyLabel}</div>
                    </>
                  )}
                </TableCell>
                <TableCell>
                  {row.parserVsAudit === "agree" ? (
                    <Badge variant="success" size="sm">agree</Badge>
                  ) : row.parserVsAudit === "disagree" ? (
                    <Badge variant="danger" size="sm">disagree</Badge>
                  ) : (
                    <Badge variant="secondary" size="sm">—</Badge>
                  )}
                  {row.parserVsAuditWhy ? (
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      {row.parserVsAuditWhy}
                    </div>
                  ) : null}
                </TableCell>
                <TableCell>{stateBadge(row.state)}</TableCell>
                <TableCell>
                  <RowActions
                    row={row}
                    review={review}
                    busy={busy}
                    typed={typedByRow[row.row] ?? ""}
                    onTyped={(v) =>
                      setTypedByRow((prev) => ({ ...prev, [row.row]: v }))
                    }
                    onAction={(body) => void postAction(body)}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card px-4 py-3 shadow-e2">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3">
          <div className="text-sm">
            <span className="font-semibold">
              {counts.confirmed} of {counts.proposed} confirmed
            </span>
            <span className="text-muted-foreground">
              {" "}
              · {counts.needs_decision} need a decision · {counts.green_unconfirmed}{" "}
              green unconfirmed
            </span>
            <div className="text-[11px] text-muted-foreground">
              Every decision is saved on the stage.
            </div>
          </div>
          <div className="h-2 w-full max-w-xs overflow-hidden rounded-pill bg-muted">
            <div
              className="h-full bg-pacing-ahead"
              style={{
                width: `${
                  counts.proposed === 0
                    ? 0
                    : Math.round((counts.confirmed / counts.proposed) * 100)
                }%`,
              }}
            />
          </div>
          <Button
            type="button"
            disabled={busy || !gate.ok}
            onClick={() => void onLoad()}
          >
            Load {loadCount} lines into {channelLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}

function StatTile(props: {
  label: string
  value: string
  detail: string
  tone?: "ok" | "warn" | "bad"
}) {
  return (
    <div className="rounded-card border border-border bg-card p-3 shadow-e1">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {props.label}
      </div>
      <div
        className={cn(
          "num mt-1 text-xl font-semibold",
          props.tone === "ok" && "text-status-ahead-fg",
          props.tone === "warn" && "text-status-behind-fg",
          props.tone === "bad" && "text-status-critical-fg",
        )}
      >
        {props.value}
      </div>
      <div className="text-xs text-muted-foreground">{props.detail}</div>
    </div>
  )
}

function RowActions(props: {
  row: ParseReviewRowView
  review: IngestReviewPackage
  busy: boolean
  typed: string
  onTyped: (v: string) => void
  onAction: (body: Record<string, unknown>) => void
}) {
  const { row, review, busy } = props
  if (row.leftover) return null
  if (row.state === "excluded") {
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={() => props.onAction({ action: "include", row: row.row })}
      >
        Include anyway
      </Button>
    )
  }
  if (row.state === "value_card") {
    const unresolved = unresolvedValuesForRow(review, row.row)[0]
    const vocab = unresolved
      ? getControlledVocabulary(unresolved.vocabulary)
      : null
    const transit =
      vocab?.values.find((v) => v.toLowerCase() === "transit") ?? null
    return (
      <div className="flex flex-wrap gap-1">
        {transit ? (
          <Button
            type="button"
            size="sm"
            disabled={busy}
            onClick={() =>
              props.onAction({
                action: "resolve_value",
                row: row.row,
                answer: transit,
              })
            }
          >
            Format = Transit (learn, {row.siblingCount} lines)
          </Button>
        ) : null}
        {(vocab?.values ?? []).slice(0, 6).map((v) =>
          v === transit ? null : (
            <Button
              key={v}
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() =>
                props.onAction({
                  action: "resolve_value",
                  row: row.row,
                  answer: v,
                })
              }
            >
              {vocab?.labelByValue[v] ?? v}
            </Button>
          ),
        )}
      </div>
    )
  }
  if (row.state === "decide") {
    return (
      <div className="flex flex-wrap items-center gap-1">
        <Button
          type="button"
          size="sm"
          disabled={busy}
          onClick={() =>
            props.onAction({
              action: "resolve_discrepancy",
              row: row.row,
              answer: AUDIT_RESOLUTION_LABEL,
            })
          }
        >
          Use audit
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() =>
            props.onAction({
              action: "resolve_discrepancy",
              row: row.row,
              answer: PARSER_RESOLUTION_LABEL,
            })
          }
        >
          Use parser
        </Button>
        <Input
          className="h-8 w-28"
          placeholder="Type value"
          value={props.typed}
          onChange={(e) => props.onTyped(e.target.value)}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy || !props.typed.trim()}
          onClick={() =>
            props.onAction({
              action: "resolve_discrepancy",
              row: row.row,
              answer: props.typed.trim(),
            })
          }
        >
          Type value
        </Button>
      </div>
    )
  }
  if (row.state === "waits") {
    return (
      <Button type="button" size="sm" variant="outline" disabled>
        Confirm
      </Button>
    )
  }
  return (
    <div className="flex flex-wrap gap-1">
      {row.state === "green_unconfirmed" ? (
        <Button
          type="button"
          size="sm"
          disabled={busy}
          onClick={() => props.onAction({ action: "confirm", row: row.row })}
        >
          Confirm
        </Button>
      ) : null}
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={() => props.onAction({ action: "exclude", row: row.row })}
      >
        Exclude
      </Button>
    </div>
  )
}
