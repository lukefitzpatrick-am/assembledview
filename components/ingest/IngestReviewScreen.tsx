"use client"

import { useState } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type {
  IngestProposal,
  ProposedLineItem,
} from "@/lib/mediaplans/ingest/proposeLineItems"
import type {
  ColumnMappingRow,
  IgnoredSummary,
  IngestReviewPackage,
} from "@/lib/mediaplans/ingest/buildIngestReview"
import {
  AVA_MAPPING_TARGET_DESCRIPTORS,
  ingestMappingRowKey,
  type AvaColumnMappingProposal,
} from "@/lib/mediaplans/ingest/avaColumnMapping"
import { REFERENCE_IGNORE_TARGET } from "@/lib/mediaplans/ingest/publisherProfileConfig"
import { summarizePanelFlights } from "@/lib/mediaplans/ingest/panelFlightSummary"
import { isStatedMoneySynonym } from "@/lib/mediaplans/ingest/moneySynonyms"
import {
  evaluateRequiredFieldGate,
  type TemplateFieldCoverage,
} from "@/lib/mediaplans/ingest/templateCoverage"
import {
  buildReviewCardSurface,
  type ReviewCardDetailRow,
  type ReviewCardRow,
} from "@/lib/mediaplans/ingest/reviewCardSurface"

const CANONICAL_FIELDS = [
  ...AVA_MAPPING_TARGET_DESCRIPTORS,
  REFERENCE_IGNORE_TARGET,
]

type Props = {
  review: IngestReviewPackage
  onRemap: (header: string, mappedTo: string | null) => Promise<void>
  /** Accept an AVA proposal → same remap persistence path. */
  onAcceptAvaProposal?: (proposal: AvaColumnMappingProposal) => Promise<void>
  onAccept: () => Promise<void>
  onCancel: () => void
  accepting?: boolean
  remapping?: boolean
  /** Campaign target shown on accept strip */
  campaignHint?: string
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`
}

function remapTargetForField(
  field: TemplateFieldCoverage,
  header: string,
): string | null {
  const canonicals = field.canonicals ?? []
  if (canonicals.length === 0) return null
  if (field.id === "media_money" && isStatedMoneySynonym(header)) {
    return "media_amount:stated"
  }
  return canonicals[0] ?? null
}

function sourceLabel(field: TemplateFieldCoverage): string {
  switch (field.source.kind) {
    case "header":
      return field.source.header ?? "—"
    case "grouping_rows":
      return "grouping rows"
    case "profile":
      return field.source.header ?? "profile"
    case "derived":
      return field.source.header ?? "derived"
    case "grid":
      return "date grid"
    case "waiver":
      return "waiver"
    default:
      return "—"
  }
}

function mediaTypeHeaderLabel(review: IngestReviewPackage): string {
  const type =
    review.detected_media_type === "ooh"
      ? "OOH"
      : review.detected_media_type === "radio"
        ? "Radio"
        : review.detected_media_type
          ? review.detected_media_type
          : "unknown"
  const status =
    review.media_type_status === "detected"
      ? "detected"
      : review.media_type_status === "ambiguous"
        ? "ambiguous"
        : "unknown"
  return `Media type: ${type} — ${status}`
}

function isPanelAnonymousWarning(w: string): boolean {
  return /panel lines will be anonymous/i.test(w)
}

function LineItemCard({
  item,
  index,
}: {
  item: ProposedLineItem
  index: number
}) {
  const [open, setOpen] = useState(false)
  const panelCount = item.panels.length
  const label =
    [
      item.grouping.format,
      item.grouping.state,
      item.grouping.station,
      item.grouping.media_description,
    ]
      .filter(Boolean)
      .join(" · ") || `Line ${index + 1}`

  return (
    <div className="rounded-card border border-border bg-card shadow-e1">
      <button
        type="button"
        className="interactive flex w-full items-center gap-2 px-4 py-3 text-left"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <span className="flex-1 font-medium text-foreground">{label}</span>
        <Badge variant="secondary">
          <span className="num">{panelCount}</span> panel
          {panelCount === 1 ? "" : "s"}
        </Badge>
        <Badge variant="outline">
          <span className="num">{item.bursts.length}</span> burst
          {item.bursts.length === 1 ? "" : "s"}
        </Badge>
      </button>

      {open ? (
        <div className="space-y-3 border-t border-border px-4 py-3">
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Bursts
            </p>
            <ul className="space-y-1 text-sm text-foreground">
              {item.bursts.map((b, i) => (
                <li key={i} className="flex flex-wrap gap-2">
                  <span className="num">
                    {b.start_date ?? "?"} → {b.end_date ?? "?"}
                  </span>
                  <span className="text-muted-foreground">·</span>
                  <span>qty <span className="num">{b.quantity}</span></span>
                  <span className="text-muted-foreground">·</span>
                  <span>
                    media $<span className="num">{b.media_amount}</span>
                  </span>
                  <Badge variant="outline">{b.booking_status}</Badge>
                </li>
              ))}
            </ul>
          </div>

          {open && panelCount > 0 ? (
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Panels (expanded on demand)
              </p>
              <ul className="max-h-64 space-y-2 overflow-y-auto text-sm">
                {item.panels.map((p, i) => (
                  <li
                    key={i}
                    className="rounded-input border border-border bg-surface-panel px-3 py-2"
                  >
                    <div className="font-medium text-foreground">
                      {p.descriptors.site_number ||
                        p.descriptors.panel_name ||
                        p.source_row_ref}
                    </div>
                    <div className="text-muted-foreground">
                      {[
                        p.descriptors.suburb,
                        p.descriptors.state,
                        p.descriptors.format,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                    {(() => {
                      const summary = summarizePanelFlights(
                        p.flights ?? [],
                        p.grid_period_count ?? 0,
                      )
                      if (summary.totalPeriodCount <= 0) return null
                      return (
                        <p className="mt-1 text-xs text-muted-foreground">
                          <span className="num">{summary.label}</span>
                          {(p.flights ?? []).some((f) => f.is_bonus) ? (
                            <span> · includes bonus</span>
                          ) : null}
                        </p>
                      )
                    })()}
                    {Object.keys(p.raw_unmapped).length > 0 ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Raw unmapped:{" "}
                        {Object.entries(p.raw_unmapped)
                          .map(([k, v]) => `${k}=${v}`)
                          .join("; ")}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function FieldStatusBadge({ field }: { field: TemplateFieldCoverage }) {
  if (field.matched) return <Badge variant="secondary">matched</Badge>
  if (field.role === "required") return <Badge variant="destructive">missing</Badge>
  return <Badge variant="outline">optional</Badge>
}

function FieldRowCells({
  field,
  leftoverHeaders,
  onRemap,
  remapping,
  avaByHeader,
  onAcceptAvaProposal,
}: {
  field: TemplateFieldCoverage
  leftoverHeaders: string[]
  onRemap: (header: string, mappedTo: string | null) => Promise<void>
  remapping?: boolean
  avaByHeader: Map<string, AvaColumnMappingProposal>
  onAcceptAvaProposal?: (proposal: AvaColumnMappingProposal) => Promise<void>
}) {
  const ava = leftoverHeaders
    .map((h) =>
      avaByHeader.get(h.replace(/\s+/g, " ").trim().toLowerCase()),
    )
    .find(
      (p) =>
        p?.proposed_mapped_to &&
        field.canonicals?.includes(p.proposed_mapped_to),
    )
  return (
    <>
      <td className="px-3 py-2 text-foreground">
        {field.matched ? (
          sourceLabel(field)
        ) : leftoverHeaders.length > 0 &&
          (field.canonicals?.length ?? 0) > 0 ? (
          <select
            className="w-full rounded-input border border-border bg-background px-2 py-1 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            disabled={remapping}
            defaultValue=""
            onChange={(e) => {
              const v = e.target.value
              const mappedTo = v ? remapTargetForField(field, v) : null
              if (v && mappedTo) void onRemap(v, mappedTo)
            }}
          >
            <option value="">— pick a source column —</option>
            {leftoverHeaders.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
        ) : (
          "—"
        )}
      </td>
      <td className="px-3 py-2 text-muted-foreground">
        {field.source.sample ?? "—"}
      </td>
      <td className="px-3 py-2">
        <FieldStatusBadge field={field} />
        {ava && !field.matched ? (
          <div className="mt-2 max-w-xs space-y-1">
            <p className="text-xs text-muted-foreground">
              AVA proposes {ava.header} → {ava.proposed_mapped_to}
            </p>
            <Button
              type="button"
              size="sm"
              disabled={remapping || !onAcceptAvaProposal}
              onClick={() => void onAcceptAvaProposal?.(ava)}
            >
              Accept AVA
            </Button>
          </div>
        ) : null}
      </td>
    </>
  )
}

function PanelDetailRow({
  row,
  leftoverHeaders,
  onRemap,
  remapping,
  avaByHeader,
  onAcceptAvaProposal,
}: {
  row: ReviewCardDetailRow
  leftoverHeaders: string[]
  onRemap: (header: string, mappedTo: string | null) => Promise<void>
  remapping?: boolean
  avaByHeader: Map<string, AvaColumnMappingProposal>
  onAcceptAvaProposal?: (proposal: AvaColumnMappingProposal) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <tr className="interactive-row border-t border-border">
        <td className="px-3 py-2" colSpan={4}>
          <button
            type="button"
            className="interactive flex w-full items-center gap-2 text-left"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
          >
            {open ? (
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <span className="font-medium text-foreground">{row.summary}</span>
            <Badge variant="outline">
              <span className="num">{row.matched}</span> /{" "}
              <span className="num">{row.total}</span>
            </Badge>
          </button>
          {row.warning ? (
            <p className="mt-1 pl-6 text-sm text-status-behind-fg">
              {row.warning}
            </p>
          ) : null}
        </td>
      </tr>
      {open
        ? row.fields.map((field) => (
            <tr
              key={field.id}
              className="interactive-row border-t border-border bg-surface-panel align-top"
            >
              <td className="px-3 py-2 text-foreground">
                <span className="font-medium">{field.label}</span>
              </td>
              <FieldRowCells
                field={field}
                leftoverHeaders={leftoverHeaders}
                onRemap={onRemap}
                remapping={remapping}
                avaByHeader={avaByHeader}
                onAcceptAvaProposal={onAcceptAvaProposal}
              />
            </tr>
          ))
        : null}
    </>
  )
}

function PlanFieldsTable({
  rows,
  leftoverHeaders,
  onRemap,
  remapping,
  avaByHeader,
  onAcceptAvaProposal,
}: {
  rows: ReviewCardRow[]
  leftoverHeaders: string[]
  onRemap: (header: string, mappedTo: string | null) => Promise<void>
  remapping?: boolean
  avaByHeader: Map<string, AvaColumnMappingProposal>
  onAcceptAvaProposal?: (proposal: AvaColumnMappingProposal) => Promise<void>
}) {
  return (
    <div className="overflow-x-auto rounded-card border border-border">
      <table className="w-full text-sm">
        <thead className="bg-surface-panel text-left text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Plan field</th>
            <th className="px-3 py-2 font-medium">Source</th>
            <th className="px-3 py-2 font-medium">Sample</th>
            <th className="px-3 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            if (row.kind === "detail_table") {
              return (
                <PanelDetailRow
                  key={row.id}
                  row={row}
                  leftoverHeaders={leftoverHeaders}
                  onRemap={onRemap}
                  remapping={remapping}
                  avaByHeader={avaByHeader}
                  onAcceptAvaProposal={onAcceptAvaProposal}
                />
              )
            }
            const { field } = row
            return (
              <tr
                key={row.id}
                className="interactive-row border-t border-border align-top"
              >
                <td className="px-3 py-2 text-foreground">
                  <span className="font-medium">{row.label}</span>
                  {field.role === "enrich" && !field.matched ? (
                    <span className="ml-2 text-xs text-muted-foreground">
                      optional
                    </span>
                  ) : null}
                  {row.details.length > 0 ? (
                    <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                      {row.details.map((d) => (
                        <li key={d.id}>
                          {d.label}: {d.matched ? sourceLabel(d) : "—"}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </td>
                <FieldRowCells
                  field={field}
                  leftoverHeaders={leftoverHeaders}
                  onRemap={onRemap}
                  remapping={remapping}
                  avaByHeader={avaByHeader}
                  onAcceptAvaProposal={onAcceptAvaProposal}
                />
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function MappingTable({
  rows,
  onRemap,
  remapping,
  avaByHeader,
  onAcceptAvaProposal,
}: {
  rows: ColumnMappingRow[]
  onRemap: (header: string, mappedTo: string | null) => Promise<void>
  remapping?: boolean
  avaByHeader: Map<string, AvaColumnMappingProposal>
  onAcceptAvaProposal?: (proposal: AvaColumnMappingProposal) => Promise<void>
}) {
  return (
    <div className="overflow-x-auto rounded-card border border-border">
      <table className="w-full text-sm">
        <thead className="bg-surface-panel text-left text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Publisher column</th>
            <th className="px-3 py-2 font-medium">Maps to</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">AVA</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const ava = avaByHeader.get(
              row.header.replace(/\s+/g, " ").trim().toLowerCase(),
            )
            return (
              <tr
                key={ingestMappingRowKey(row, index)}
                className="interactive-row border-t border-border align-top"
              >
                <td className="px-3 py-2 text-foreground">{row.header}</td>
                <td className="px-3 py-2">
                  <select
                    className="w-full rounded-input border border-border bg-background px-2 py-1 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    disabled={remapping}
                    value={row.mapped_to ?? ""}
                    onChange={(e) => {
                      const v = e.target.value
                      void onRemap(row.header, v === "" ? null : v)
                    }}
                  >
                    <option value="">— UNMAPPED —</option>
                    {CANONICAL_FIELDS.map((f) => (
                      <option key={f} value={f}>
                        {f === REFERENCE_IGNORE_TARGET
                          ? "reference — ignored"
                          : f}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2">
                  {row.mapped_to === REFERENCE_IGNORE_TARGET ? (
                    <Badge variant="outline">reference — ignored</Badge>
                  ) : row.unmapped ? (
                    <Badge variant="destructive">UNMAPPED</Badge>
                  ) : (
                    <Badge variant="secondary">mapped</Badge>
                  )}
                </td>
                <td className="px-3 py-2">
                  {ava ? (
                    <div className="max-w-xs space-y-2">
                      <p className="text-xs text-muted-foreground">
                        {ava.reasoning}
                      </p>
                      <p className="text-xs text-foreground">
                        Proposes{" "}
                        <span className="font-medium">
                          {ava.proposed_mapped_to ?? "leave unmapped"}
                        </span>
                      </p>
                      {ava.sample_values.length > 0 ? (
                        <p className="text-xs text-muted-foreground">
                          Samples: {ava.sample_values.slice(0, 4).join(", ")}
                        </p>
                      ) : null}
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          disabled={remapping || !onAcceptAvaProposal}
                          onClick={() => void onAcceptAvaProposal?.(ava)}
                        >
                          Accept AVA
                        </Button>
                        <span className="text-xs text-muted-foreground self-center">
                          or override via Maps to
                        </span>
                      </div>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function IgnoredBlock({ ignored }: { ignored: IgnoredSummary }) {
  if (ignored.spoken.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nothing ignored — every sheet/row/column was considered.
      </p>
    )
  }
  return (
    <ul className="space-y-1 text-sm text-foreground">
      {ignored.spoken.map((s) => (
        <li key={s} className="rounded-input bg-surface-panel px-3 py-2">
          {s}
        </li>
      ))}
    </ul>
  )
}

function ReconciliationBlock({ proposal }: { proposal: IngestProposal }) {
  const r = proposal.reconciliation
  const deltaPct =
    r.delta_pct != null ? `${(r.delta_pct * 100).toFixed(2)}%` : "—"
  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {(
          [
            ["Line items", r.line_item_count],
            ["Panels", r.panel_count],
            ["Bursts", r.burst_count],
            ["Total media $", r.total_media_amount],
            ["File stated $", r.file_stated_total ?? "—"],
            ["Delta", deltaPct],
          ] as const
        ).map(([label, value]) => (
          <div
            key={label}
            className="rounded-card border border-border bg-card px-3 py-2 shadow-e0"
          >
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="num text-lg font-semibold text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
          {!r.accept_ok && r.block_reason ? (
        <p className="rounded-input border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Accept blocked: {r.block_reason}
        </p>
      ) : null}
      {r.warnings.length > 0 ? (
        <ul className="space-y-1 text-sm text-muted-foreground">
          {r.warnings.slice(0, 8).map((w) => (
            <li key={w} className="rounded-input bg-surface-panel px-3 py-1.5">
              {w}
            </li>
          ))}
          {r.warnings.length > 8 ? (
            <li className="text-xs">+{r.warnings.length - 8} more warnings</li>
          ) : null}
        </ul>
      ) : null}
    </div>
  )
}

export function IngestReviewScreen({
  review,
  onRemap,
  onAcceptAvaProposal,
  onAccept,
  onCancel,
  accepting,
  remapping,
  campaignHint,
}: Props) {
  const coverage = review.template_coverage
  const requiredGate = evaluateRequiredFieldGate(coverage ?? { required: [], waivers: [] })
  const leftoverHeaders = (coverage?.not_used ?? []).map((n) => n.header)
  const leftoverRows: ColumnMappingRow[] = leftoverHeaders.map((header) => ({
    header,
    mapped_to: null,
    unmapped: true,
  }))
  const cardSurface = coverage ? buildReviewCardSurface(coverage) : null
  const headerWarnings = (coverage?.warnings ?? []).filter(
    (w) => !isPanelAnonymousWarning(w),
  )
  const avaByHeader = new Map(
    (review.ava_mapping_proposals ?? []).map((p) => [
      p.header.replace(/\s+/g, " ").trim().toLowerCase(),
      p,
    ]),
  )

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-8 p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Review schedule import
        </h1>
        <p className="text-sm text-muted-foreground">
          Completeness is the plan template, not leftover file columns. AVA
          asks only when a required field has no source. Nothing enters a plan
          until you accept.
        </p>
      </header>

      <section className="space-y-3 rounded-card border border-border bg-card p-4 shadow-e1">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Detected publisher
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xl font-semibold text-foreground">
            {review.detected_publisher ?? "Unknown"}
          </span>
          <Badge
            variant={
              review.media_type_status === "detected" ? "secondary" : "outline"
            }
          >
            {mediaTypeHeaderLabel(review)}
          </Badge>
          <Badge variant={requiredGate.ok ? "secondary" : "destructive"}>
            {coverage
              ? `${coverage.required_matched} of ${coverage.required_count} required`
              : `Confidence ${pct(review.publisher_confidence)}`}
          </Badge>
          <Badge variant="outline">
            Confidence{" "}
            <span className="num">{pct(review.publisher_confidence)}</span>
          </Badge>
          <Badge variant="outline">
            AVA calls <span className="num">{review.ava_call_count ?? 0}</span>
          </Badge>
          {review.sheet_name ? (
            <span className="text-sm text-muted-foreground">
              Sheet: {review.sheet_name}
            </span>
          ) : null}
        </div>
        {review.match_reasons.length > 0 ? (
          <p className="text-xs text-muted-foreground">
            {review.match_reasons.join(" · ")}
          </p>
        ) : null}
        {headerWarnings.map((w) => (
          <p key={w} className="text-sm text-status-behind-fg">
            {w}
          </p>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          A · Your plan
        </h2>
        {cardSurface && cardSurface.rows.length > 0 ? (
          <PlanFieldsTable
            rows={cardSurface.rows}
            leftoverHeaders={leftoverHeaders}
            onRemap={onRemap}
            remapping={remapping}
            avaByHeader={avaByHeader}
            onAcceptAvaProposal={onAcceptAvaProposal}
          />
        ) : review.column_mapping.length > 0 ? (
          <MappingTable
            rows={review.column_mapping}
            onRemap={onRemap}
            remapping={remapping}
            avaByHeader={avaByHeader}
            onAcceptAvaProposal={onAcceptAvaProposal}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            Detect a publisher to see the plan template.
          </p>
        )}
      </section>

      {leftoverRows.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            C · Not used
          </h2>
          <p className="text-sm text-muted-foreground">
            Leftover publisher columns are ignored by default. Map one only if
            a required field above is missing.
          </p>
          <MappingTable
            rows={leftoverRows}
            onRemap={onRemap}
            remapping={remapping}
            avaByHeader={avaByHeader}
            onAcceptAvaProposal={onAcceptAvaProposal}
          />
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Ignored
        </h2>
        <IgnoredBlock ignored={review.ignored} />
      </section>

      {review.proposal ? (
        <>
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Reconciliation
            </h2>
            <ReconciliationBlock proposal={review.proposal} />
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Proposed line items
            </h2>
            <p className="text-sm text-muted-foreground">
              Panels stay collapsed. Expand a line to load its panel list —
              large packs (hundreds of panels) must not render open by default.
            </p>
            <div className="space-y-2">
              {review.proposal.line_items.map((item, i) => (
                <LineItemCard key={i} item={item} index={i} />
              ))}
            </div>
          </section>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          No proposal — pick a different file or fix the publisher match.
        </p>
      )}

      <footer className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-border bg-background/95 py-4 backdrop-blur">
        {campaignHint ? (
          <span className="mr-auto text-sm text-muted-foreground">
            {campaignHint}
          </span>
        ) : (
          <span className="mr-auto" />
        )}
        <Button type="button" variant="outline" onClick={onCancel} disabled={accepting}>
          Cancel
        </Button>
        <Button
          type="button"
          onClick={() => void onAccept()}
          disabled={
            accepting ||
            !review.proposal ||
            review.proposal.reconciliation.accept_ok === false ||
            !requiredGate.ok
          }
        >
          {accepting ? "Accepting…" : "Accept into campaign"}
        </Button>
      </footer>
    </div>
  )
}
