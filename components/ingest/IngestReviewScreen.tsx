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
import type { AvaColumnMappingProposal } from "@/lib/mediaplans/ingest/avaColumnMapping"
import { AVA_MAPPING_TARGET_DESCRIPTORS } from "@/lib/mediaplans/ingest/avaColumnMapping"
import { summarizePanelFlights } from "@/lib/mediaplans/ingest/panelFlightSummary"

const CANONICAL_FIELDS = AVA_MAPPING_TARGET_DESCRIPTORS

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
          {rows.map((row) => {
            const ava = avaByHeader.get(
              row.header.replace(/\s+/g, " ").trim().toLowerCase(),
            )
            return (
              <tr
                key={row.header}
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
                        {f}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2">
                  {row.unmapped ? (
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
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {(
        [
          ["Line items", r.line_item_count],
          ["Panels", r.panel_count],
          ["Bursts", r.burst_count],
          ["Total media $", r.total_media_amount],
          ["File stated $", r.file_stated_total ?? "—"],
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
  const lowConfidence = review.publisher_confidence < 0.9
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
          Nothing enters a plan until you accept. Corrections here improve the
          next file. AVA may propose mappings when confidence is below 90% —
          you still confirm.
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
          <Badge variant={lowConfidence ? "destructive" : "secondary"}>
            Confidence <span className="num">{pct(review.publisher_confidence)}</span>
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
        {lowConfidence ? (
          <p className="text-sm text-status-critical-fg">
            Confidence below 90% — AVA may propose column mappings. Never
            auto-accepted.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Confidence ≥ 90% — deterministic mapping wins; AVA was not called.
          </p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Ignored
        </h2>
        <IgnoredBlock ignored={review.ignored} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Column mapping
        </h2>
        <MappingTable
          rows={review.column_mapping}
          onRemap={onRemap}
          remapping={remapping}
          avaByHeader={avaByHeader}
          onAcceptAvaProposal={onAcceptAvaProposal}
        />
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
          disabled={accepting || !review.proposal}
        >
          {accepting ? "Accepting…" : "Accept into campaign"}
        </Button>
      </footer>
    </div>
  )
}
