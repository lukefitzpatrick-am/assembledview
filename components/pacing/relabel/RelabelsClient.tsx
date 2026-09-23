"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { format, parseISO } from "date-fns"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states"
import { useToast } from "@/components/ui/use-toast"
import { formatMoney } from "@/lib/format/money"
import { matchTextAny } from "@/lib/search/matchText"
import type { UnmappedPlacement } from "@/lib/pacing/admin/unmappedPlacements"
import type { LineCardModel } from "@/lib/pacing/channel/lineCardTypes"
import { normalizeLineItemId } from "@/lib/pacing/relabel/shared/channels"
import { describeRelabelWrites } from "@/lib/pacing/relabel/shared/describeWrites"
import {
  canRevertRelabel,
  mbaStem,
  parseRelabelsTab,
  type RelabelsTab,
} from "@/lib/pacing/relabel/shared/relabelPageUrl"
import type { DeliveryRelabelRow, RelabelPreview } from "@/lib/pacing/relabel/shared/types"
import type { RelabelDriftFinding } from "@/lib/pacing/relabel/drift"
import { CM360_PACING_CHANNEL, RELABEL_WAREHOUSE_CHANNELS } from "@/lib/pacing/relabel/shared/types"

const numberFmt = new Intl.NumberFormat("en-AU")

export type RelabelsQuery = {
  tab?: string
  mba?: string
  line?: string
  channel?: string
  entity?: string
  id?: string
}

type PlanLineOption = {
  lineItemId: string
  mbaNumber: string
  platform: string
  channel: string
}

function formatDateRange(firstDate: string, lastDate: string): string {
  const first = firstDate ? format(parseISO(firstDate), "d MMM") : "—"
  const last = lastDate ? format(parseISO(lastDate), "d MMM") : "—"
  if (first === last) return first
  return `${first} – ${last}`
}

function matchesMbaStem(row: UnmappedPlacement, stem: string): boolean {
  if (!stem) return true
  const s = stem.toUpperCase()
  return (
    (row.suggestedMba ?? "").toUpperCase().startsWith(s) ||
    (row.campaignName ?? "").toUpperCase().includes(s) ||
    (row.placementName ?? "").toUpperCase().includes(s)
  )
}

function statusVariant(status: string): "success" | "warning" | "secondary" {
  if (status === "applied") return "success"
  if (status === "blocked") return "warning"
  return "secondary"
}

function applyRows(row: DeliveryRelabelRow): number {
  const result = row.applyResult ?? {}
  return Number(result.rowsUpdated ?? result.rowsMoving ?? 0) || 0
}

function applySpend(row: DeliveryRelabelRow): number {
  const result = row.applyResult ?? {}
  return Number(result.spendMoving ?? 0) || 0
}

function mapRowKept(preview: RelabelPreview): boolean {
  if (preview.state !== "no_change") return false
  const mapped = normalizeLineItemId(preview.activeMap?.lineItemId)
  const target = normalizeLineItemId(preview.lineItemId)
  return mapped.length > 0 && mapped === target
}

export function RelabelsClient({ initial }: { initial: RelabelsQuery }) {
  const { toast } = useToast()
  const [tab, setTab] = useState<RelabelsTab>(() =>
    initial.id ? "log" : parseRelabelsTab(initial.tab),
  )
  const [channel, setChannel] = useState(initial.channel ?? "")
  const [entity, setEntity] = useState(initial.entity ?? "")
  const [entitySearch, setEntitySearch] = useState(initial.entity ?? "")
  const [mba, setMba] = useState(initial.mba ?? "")
  const [lineItemId, setLineItemId] = useState(initial.line ?? "")
  const [lineSearch, setLineSearch] = useState(initial.line ?? "")
  const [scope, setScope] = useState<"all" | "range">("all")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [reason, setReason] = useState("")
  const [preview, setPreview] = useState<RelabelPreview | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [previewBusy, setPreviewBusy] = useState(false)
  const [applyBusy, setApplyBusy] = useState(false)
  const [ackWarnings, setAckWarnings] = useState(false)

  const [placements, setPlacements] = useState<UnmappedPlacement[] | null>(null)
  const [unmappedError, setUnmappedError] = useState<string | null>(null)
  const [relabels, setRelabels] = useState<DeliveryRelabelRow[] | null>(null)
  const [drift, setDrift] = useState<RelabelDriftFinding[]>([])
  const [logError, setLogError] = useState<string | null>(null)
  const [planLines, setPlanLines] = useState<PlanLineOption[]>([])
  const [viewRow, setViewRow] = useState<DeliveryRelabelRow | null>(null)

  const loadUnmapped = useCallback(async () => {
    setUnmappedError(null)
    try {
      const r = await fetch("/api/admin/unmapped-placements", { credentials: "include" })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const json = (await r.json()) as { placements: UnmappedPlacement[] }
      setPlacements(json.placements)
    } catch (e) {
      setUnmappedError(e instanceof Error ? e.message : String(e))
      setPlacements([])
    }
  }, [])

  const loadLog = useCallback(async () => {
    setLogError(null)
    try {
      const r = await fetch("/api/pacing/relabels", { credentials: "include" })
      if (r.status === 503) {
        const json = (await r.json().catch(() => null)) as { message?: string } | null
        throw new Error(json?.message || "delivery_relabels is unavailable (0085 not applied).")
      }
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const json = (await r.json()) as { relabels: DeliveryRelabelRow[]; drift?: RelabelDriftFinding[] }
      setRelabels(json.relabels)
      setDrift((json.drift ?? []).filter((row) => row.kind === "drift"))
    } catch (e) {
      setLogError(e instanceof Error ? e.message : String(e))
      setRelabels([])
    }
  }, [])

  useEffect(() => {
    void loadUnmapped()
  }, [loadUnmapped])

  useEffect(() => {
    if (tab === "log") void loadLog()
  }, [tab, loadLog])

  useEffect(() => {
    const id = Number(initial.id)
    if (!Number.isFinite(id) || id <= 0) return
    let cancelled = false
    fetch(`/api/pacing/relabels/${id}`, { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) return null
        return (await r.json()) as { relabel?: DeliveryRelabelRow }
      })
      .then((json) => {
        if (!cancelled && json?.relabel) setViewRow(json.relabel)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [initial.id])

  useEffect(() => {
    const mbaNumber = mba.trim()
    if (!mbaNumber) {
      setPlanLines([])
      return
    }
    let cancelled = false
    fetch(`/api/pacing/campaign/${encodeURIComponent(mbaNumber)}`, { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) return { lines: [] as LineCardModel[] }
        return (await r.json()) as { lines?: LineCardModel[] }
      })
      .then((json) => {
        if (cancelled) return
        setPlanLines(
          (json.lines ?? []).map((line) => ({
            lineItemId: line.lineItemId,
            mbaNumber: line.mba,
            platform: line.platform,
            channel: line.channel,
          })),
        )
      })
      .catch(() => {
        if (!cancelled) setPlanLines([])
      })
    return () => {
      cancelled = true
    }
  }, [mba])

  const unmappedFilter = mbaStem(initial.tab === "unmapped" ? initial.mba ?? mba : mba)
  const filteredUnmapped = useMemo(() => {
    const rows = placements ?? []
    return rows.filter((row) => matchesMbaStem(row, unmappedFilter))
  }, [placements, unmappedFilter])

  const entityHits = useMemo(() => {
    const q = entitySearch.trim()
    if (!q) return []
    return (placements ?? [])
      .filter((row) => matchTextAny([row.placementName, row.campaignName, row.suggestedMba ?? ""], q))
      .slice(0, 8)
  }, [placements, entitySearch])

  const lineHits = useMemo(() => {
    const q = lineSearch.trim()
    if (!q) return planLines.slice(0, 8)
    return planLines
      .filter((line) => matchTextAny([line.lineItemId, line.mbaNumber, line.platform, line.channel], q))
      .slice(0, 8)
  }, [planLines, lineSearch])

  const selectedPlan = planLines.find((line) => line.lineItemId === lineItemId) ?? null
  const channelMatch =
    preview?.publishedLine && preview.cardChannel === preview.targetCardChannel
      ? `Match · ${preview.cardChannel}`
      : preview?.publishedLine
        ? `Mismatch · entity ${preview.cardChannel} vs line ${preview.targetCardChannel}`
        : selectedPlan
          ? `${selectedPlan.channel} · ${selectedPlan.platform}`
          : null

  const blocked = (preview?.blocks.length ?? 0) > 0
  const noChange = preview?.state === "no_change"
  const hasWarnings = (preview?.warnings.length ?? 0) > 0
  const writes = preview ? describeRelabelWrites(preview) : []
  const canPreview = Boolean(channel.trim() && entity.trim() && lineItemId.trim())
  const canApply = canPreview && reason.trim().length > 0 && preview && !blocked && !noChange

  const runPreview = useCallback(async () => {
    if (!canPreview) return
    setPreviewBusy(true)
    setPreviewError(null)
    setAckWarnings(false)
    try {
      const r = await fetch("/api/pacing/relabels/preview", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          channel: channel.trim(),
          platformEntityId: entity.trim(),
          lineItemId: lineItemId.trim(),
          dateFrom: scope === "range" && dateFrom ? dateFrom : null,
          dateTo: scope === "range" && dateTo ? dateTo : null,
        }),
      })
      const json = (await r.json()) as { preview?: RelabelPreview; message?: string; error?: string }
      if (r.status === 503) throw new Error(json.message || "Relabel tables unavailable.")
      if (!r.ok || !json.preview) throw new Error(json.message || json.error || `HTTP ${r.status}`)
      setPreview(json.preview)
    } catch (e) {
      setPreview(null)
      setPreviewError(e instanceof Error ? e.message : String(e))
    } finally {
      setPreviewBusy(false)
    }
  }, [canPreview, channel, entity, lineItemId, scope, dateFrom, dateTo])

  const runApply = useCallback(
    async (saveAsRequest: boolean) => {
      if (!canPreview || !reason.trim()) return
      if (!saveAsRequest && hasWarnings && !ackWarnings) {
        setAckWarnings(true)
        return
      }
      setApplyBusy(true)
      try {
        const r = await fetch("/api/pacing/relabels/apply", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            channel: channel.trim(),
            platformEntityId: entity.trim(),
            lineItemId: lineItemId.trim(),
            dateFrom: scope === "range" && dateFrom ? dateFrom : null,
            dateTo: scope === "range" && dateTo ? dateTo : null,
            reason: reason.trim(),
            acknowledgeWarnings: ackWarnings || hasWarnings,
            saveAsRequest,
          }),
        })
        const json = (await r.json()) as { message?: string; error?: string; requested?: boolean }
        if (!r.ok && !(saveAsRequest && r.status === 409)) {
          throw new Error(json.message || json.error || `HTTP ${r.status}`)
        }
        toast({
          title: saveAsRequest || json.requested ? "Request saved for Luke" : "Relabel applied",
          description: saveAsRequest
            ? "A blocked-style Codex task was created with the preview and SQL."
            : "Delivery rows and the label map were updated.",
        })
        setPreview(null)
        setAckWarnings(false)
        if (tab === "log" || saveAsRequest) void loadLog()
      } catch (e) {
        toast({
          variant: "destructive",
          title: saveAsRequest ? "Could not save request" : "Apply failed",
          description: e instanceof Error ? e.message : String(e),
        })
      } finally {
        setApplyBusy(false)
      }
    },
    [
      canPreview,
      reason,
      hasWarnings,
      ackWarnings,
      channel,
      entity,
      lineItemId,
      scope,
      dateFrom,
      dateTo,
      toast,
      tab,
      loadLog,
    ],
  )

  const prefillFromUnmapped = useCallback((row: UnmappedPlacement) => {
    setChannel(CM360_PACING_CHANNEL)
    setEntity(row.placementName)
    setEntitySearch(row.placementName)
    setMba(row.suggestedMba ?? "")
    setPreview(null)
    setAckWarnings(false)
    setTab("new")
  }, [])

  const revertRow = useCallback(
    async (row: DeliveryRelabelRow) => {
      if (!canRevertRelabel(row.createdAt)) return
      const r = await fetch(`/api/pacing/relabels/${row.id}/revert`, {
        method: "POST",
        credentials: "include",
      })
      const json = (await r.json().catch(() => null)) as { message?: string; error?: string } | null
      if (!r.ok) {
        toast({
          variant: "destructive",
          title: "Revert failed",
          description: json?.message || json?.error || `HTTP ${r.status}`,
        })
        return
      }
      toast({ title: "Relabel reverted" })
      void loadLog()
    },
    [loadLog, toast],
  )

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Delivery relabels</h1>
        <p className="text-xs text-muted-foreground">
          Move a fact-table entity onto a published plan line. Apply writes Snowflake in one
          transaction; blocked previews can be saved as a request for Luke.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(value) => setTab(parseRelabelsTab(value))}>
        <TabsList>
          <TabsTrigger value="new">New relabel</TabsTrigger>
          <TabsTrigger value="unmapped">Unmapped</TabsTrigger>
          <TabsTrigger value="log">Log</TabsTrigger>
        </TabsList>

        <TabsContent value="new" className="space-y-4 pt-4">
          <section className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-3 rounded-card border border-border bg-card p-4 shadow-e1">
              <h2 className="text-sm font-semibold">Entity</h2>
              <label className="block text-xs text-muted-foreground" htmlFor="relabel-channel">
                Warehouse channel
              </label>
              <select
                id="relabel-channel"
                className="h-10 w-full rounded-input border border-border bg-background px-3 text-sm"
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
              >
                <option value="">Select channel</option>
                {RELABEL_WAREHOUSE_CHANNELS.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <label className="block text-xs text-muted-foreground" htmlFor="relabel-entity-search">
                Search by name or id
              </label>
              <Input
                id="relabel-entity-search"
                value={entitySearch}
                onChange={(e) => setEntitySearch(e.target.value)}
                placeholder="Placement name, ad set id, or campaign"
              />
              {entityHits.length > 0 ? (
                <ul className="divide-y divide-border rounded-input border border-border">
                  {entityHits.map((row) => (
                    <li key={`${row.placementName}|${row.campaignName}`}>
                      <button
                        type="button"
                        className="interactive-row w-full px-3 py-2 text-left text-xs"
                        onClick={() => prefillFromUnmapped(row)}
                      >
                        <span className="font-mono text-foreground">{row.placementName}</span>
                        <span className="mt-0.5 block text-muted-foreground">
                          {row.campaignName} · {row.suggestedMba ?? "no MBA"}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              <label className="block text-xs text-muted-foreground" htmlFor="relabel-entity">
                Platform entity id / name
              </label>
              <Input
                id="relabel-entity"
                value={entity}
                onChange={(e) => setEntity(e.target.value)}
                placeholder="PLATFORM_LINE_ITEM_ID or LINE_ITEM_NAME"
              />
              {preview?.moves.length ? (
                <div className="space-y-1 text-xs">
                  <p className="font-medium text-foreground">Current attribution</p>
                  {preview.moves.map((move) => (
                    <p key={`${move.previousLineItemId}|${move.dateFrom}`} className="text-muted-foreground">
                      {move.previousLineItemId ?? "(unmapped)"} · {formatDateRange(move.dateFrom, move.dateTo)} ·{" "}
                      {formatMoney(move.spend, { decimals: 0 })} · {move.rows} rows
                    </p>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Preview to load this entity&apos;s current line ids, date ranges, and spend.
                </p>
              )}
            </div>

            <div className="space-y-3 rounded-card border border-border bg-card p-4 shadow-e1">
              <h2 className="text-sm font-semibold">Plan line</h2>
              <label className="block text-xs text-muted-foreground" htmlFor="relabel-mba">
                MBA
              </label>
              <Input
                id="relabel-mba"
                value={mba}
                onChange={(e) => setMba(e.target.value)}
                placeholder="BICAU002"
              />
              <label className="block text-xs text-muted-foreground" htmlFor="relabel-line-search">
                Search published lines
              </label>
              <Input
                id="relabel-line-search"
                value={lineSearch}
                onChange={(e) => setLineSearch(e.target.value)}
                placeholder="Line id, MBA, or platform"
              />
              {lineHits.length > 0 ? (
                <ul className="divide-y divide-border rounded-input border border-border">
                  {lineHits.map((line) => (
                    <li key={line.lineItemId}>
                      <button
                        type="button"
                        className="interactive-row w-full px-3 py-2 text-left text-xs"
                        onClick={() => {
                          setLineItemId(line.lineItemId)
                          setLineSearch(line.lineItemId)
                          setMba(line.mbaNumber || mba)
                        }}
                      >
                        <span className="font-mono text-foreground">{line.lineItemId}</span>
                        <span className="mt-0.5 block text-muted-foreground">
                          {line.mbaNumber} · {line.channel} · {line.platform}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              <label className="block text-xs text-muted-foreground" htmlFor="relabel-line">
                Line id
              </label>
              <Input
                id="relabel-line"
                value={lineItemId}
                onChange={(e) => setLineItemId(e.target.value)}
                placeholder="bicau002sm2"
              />
              {channelMatch ? <p className="text-xs text-muted-foreground">{channelMatch}</p> : null}

              <fieldset className="space-y-2">
                <legend className="text-xs text-muted-foreground">Scope</legend>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="relabel-scope"
                    checked={scope === "all"}
                    onChange={() => setScope("all")}
                  />
                  All history
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="relabel-scope"
                    checked={scope === "range"}
                    onChange={() => setScope("range")}
                  />
                  Date range
                </label>
                {scope === "range" ? (
                  <div className="flex gap-2">
                    <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                    <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                  </div>
                ) : null}
              </fieldset>

              <label className="block text-xs text-muted-foreground" htmlFor="relabel-reason">
                Reason (required)
              </label>
              <Textarea
                id="relabel-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why this delivery belongs on this line"
              />
            </div>
          </section>

          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void runPreview()} disabled={!canPreview || previewBusy}>
              Preview
            </Button>
            <Button
              type="button"
              onClick={() => void runApply(false)}
              disabled={!canApply || applyBusy}
            >
              {hasWarnings && ackWarnings ? "Apply anyway" : "Apply"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void runApply(true)}
              disabled={!canPreview || !reason.trim() || applyBusy}
            >
              Save as request for Luke instead
            </Button>
          </div>
          {previewError ? <p className="text-sm text-status-critical-fg">{previewError}</p> : null}

          {preview ? (
            <section className="space-y-3 rounded-card border border-border bg-card p-4 shadow-e1">
              <h2 className="text-sm font-semibold">Preview</h2>
              {preview.state === "no_change" ? (
                <p className="text-sm text-foreground">
                  Already attributed to <span className="font-mono">{preview.lineItemId}</span> for this scope. Nothing to write.
                </p>
              ) : (
                <p className="text-sm text-foreground">
                  <span className="num font-semibold">{preview.rowsMoving}</span> rows /{" "}
                  <span className="num font-semibold">{formatMoney(preview.spendMoving, { decimals: 0 })}</span>{" "}
                  moving onto <span className="font-mono">{preview.lineItemId}</span>
                </p>
              )}
              <div className="space-y-1 text-xs text-muted-foreground">
                {preview.moves.map((move) => (
                  <p key={`${move.previousLineItemId}|${move.dateFrom}`}>
                    After: {move.previousLineItemId ?? "(unmapped)"} → {preview.lineItemId} ·{" "}
                    {formatDateRange(move.dateFrom, move.dateTo)} · {formatMoney(move.spend, { decimals: 0 })}
                  </p>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {preview.duplicateOldNameDays.length === 0 ? (
                  <Badge variant="success" size="sm">
                    No double count
                  </Badge>
                ) : (
                  <Badge variant="warning" size="sm">
                    Double count on {preview.duplicateOldNameDays.length} days
                  </Badge>
                )}
                <Badge variant="info" size="sm">
                  {mapRowKept(preview) ? "Existing map row kept" : "Map row will be created"}
                </Badge>
                {preview.activeMap &&
                preview.activeMap.lineItemId &&
                preview.activeMap.lineItemId !== preview.lineItemId ? (
                  <Badge variant="warning" size="sm">
                    Entity already mapped elsewhere
                  </Badge>
                ) : null}
              </div>
              {preview.blocks.length > 0 ? (
                <ul className="list-disc pl-5 text-sm text-status-critical-fg">
                  {preview.blocks.map((block) => (
                    <li key={block.code}>{block.message}</li>
                  ))}
                </ul>
              ) : null}
              {preview.warnings.length > 0 ? (
                <ul className="list-disc pl-5 text-sm text-status-behind-fg">
                  {preview.warnings.map((warning) => (
                    <li key={warning.code}>{warning.message}</li>
                  ))}
                </ul>
              ) : null}
              <div>
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  What gets written
                </h3>
                <ul className="list-disc pl-5 text-xs text-muted-foreground">
                  {writes.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            </section>
          ) : null}
        </TabsContent>

        <TabsContent value="unmapped" className="pt-4">
          {unmappedError ? (
            <ErrorState
              title="Unmapped placements failed to load"
              message={unmappedError}
              onRetry={() => void loadUnmapped()}
            />
          ) : placements == null ? (
            <LoadingState rows={5} />
          ) : filteredUnmapped.length === 0 ? (
            <EmptyState
              title="No unmapped CM360 placements"
              message="Every Ad Serving - CM360 placement in the last 60 days already attaches to a published line or a LABEL_MAP override."
            />
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                {filteredUnmapped.length} placements in the last 60 days with no published line suffix
                and no LINE_ITEM_LABEL_MAP override.
                {unmappedFilter ? ` Filtered to ${unmappedFilter}.` : ""} Relabel pre-fills New relabel.
              </p>
              <div className="overflow-auto rounded-card border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40">
                    <tr className="text-left">
                      <th className="p-2">Placement</th>
                      <th className="p-2">Campaign</th>
                      <th className="p-2">Date range</th>
                      <th className="p-2 text-right">Impressions</th>
                      <th className="p-2">Suggested MBA</th>
                      <th className="p-2">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUnmapped.map((row) => (
                      <tr
                        key={`${row.placementName}|${row.campaignName}`}
                        className="border-t border-border"
                      >
                        <td className="p-2 font-mono">{row.placementName}</td>
                        <td className="p-2">{row.campaignName}</td>
                        <td className="p-2">{formatDateRange(row.firstDate, row.lastDate)}</td>
                        <td className="num p-2 text-right">{numberFmt.format(row.impressions)}</td>
                        <td className="p-2">{row.suggestedMba ?? "—"}</td>
                        <td className="p-2">
                          <Button type="button" size="sm" variant="outline" onClick={() => prefillFromUnmapped(row)}>
                            Relabel
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="log" className="pt-4">
          {logError ? (
            <ErrorState title="Relabel log failed to load" message={logError} onRetry={() => void loadLog()} />
          ) : relabels == null ? (
            <LoadingState rows={5} />
          ) : (
            <div className="space-y-3">
              {drift.length > 0 ? (
                <div
                  role="status"
                  data-relabel-drift-banner=""
                  className="rounded-card border border-status-critical-fg/30 bg-status-critical/10 px-4 py-3 text-sm text-status-critical-fg"
                >
                  {drift.length} map row{drift.length === 1 ? "" : "s"} drifted from applied
                  relabels. Nightly check of LINE_ITEM_LABEL_MAP vs delivery_relabels.
                </div>
              ) : null}
              {relabels.length === 0 ? (
                <EmptyState title="No relabels yet" message="Applied, blocked, and reverted rows will land here." />
              ) : (
            <div className="overflow-auto rounded-card border border-border">
              <table className="w-full text-xs">
                <thead className="bg-muted/40">
                  <tr className="text-left">
                    <th className="p-2">Status</th>
                    <th className="p-2">Actor</th>
                    <th className="p-2">Time</th>
                    <th className="p-2">Move</th>
                    <th className="p-2 text-right">Rows</th>
                    <th className="p-2 text-right">Spend</th>
                    <th className="p-2">Reason</th>
                    <th className="p-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {relabels.map((row) => (
                    <tr key={row.id} className="border-t border-border">
                      <td className="p-2">
                        <Badge variant={statusVariant(row.status)} size="sm">
                          {row.status}
                        </Badge>
                      </td>
                      <td className="p-2">{row.actorEmail}</td>
                      <td className="p-2">{row.createdAt.slice(0, 16).replace("T", " ")}</td>
                      <td className="p-2">
                        <span className="font-mono">{row.entityName ?? row.platformEntityId}</span>
                        {" → "}
                        <span className="font-mono">{row.toLineItemId}</span>
                        {row.fromLineItemId ? (
                          <span className="block text-muted-foreground">was {row.fromLineItemId}</span>
                        ) : null}
                      </td>
                      <td className="num p-2 text-right">{applyRows(row)}</td>
                      <td className="num p-2 text-right">{formatMoney(applySpend(row), { decimals: 0 })}</td>
                      <td className="p-2">{row.reason}</td>
                      <td className="p-2">
                        <div className="flex flex-wrap gap-1">
                          <Button type="button" size="sm" variant="ghost" onClick={() => setViewRow(row)}>
                            View
                          </Button>
                          {row.status === "applied" && canRevertRelabel(row.createdAt) ? (
                            <Button type="button" size="sm" variant="outline" onClick={() => void revertRow(row)}>
                              Revert
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
              )}
              {viewRow ? (
            <section className="rounded-card border border-border bg-card p-4 text-xs shadow-e1">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold">Relabel #{viewRow.id}</h2>
                <Button type="button" size="sm" variant="ghost" onClick={() => setViewRow(null)}>
                  Close
                </Button>
              </div>
              <pre className="max-h-80 overflow-auto whitespace-pre-wrap text-muted-foreground">
                {JSON.stringify(viewRow, null, 2)}
              </pre>
            </section>
              ) : null}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
