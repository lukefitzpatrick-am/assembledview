"use client"

import { Fragment } from "react"
import type { TaxonomyRow } from "@/lib/planning/adapter"
import { cn } from "@/lib/utils"
import { AUDIENCE_ACCENTS } from "./constants"
import type { AudienceCompareBundle } from "./StageCompare"
import { TaxonomyStatusBadge } from "./TaxonomyStatusBadge"
import { effectiveSegmentId } from "./store"
import { fmtReachPct, groupTaxonomy } from "./taxonomyGrouping"

type AllChannelsCompareTableProps = {
  bundles: AudienceCompareBundle[]
}

/**
 * Multi-audience all-channels taxonomy table.
 * Score column omitted — with 1–3 audiences, reach|index pairs already crowd the grid;
 * BCS ranking / DFII live in the Recommended split block below.
 */
export function AllChannelsCompareTable({ bundles }: AllChannelsCompareTableProps) {
  const skeleton = pickTaxonomySkeleton(bundles)
  const groups = groupTaxonomy(skeleton)

  if (groups.length === 0) {
    return (
      <div className="rounded-card border border-border bg-card px-3 py-6 text-center text-xs text-muted-foreground shadow-e1">
        No channel taxonomy yet — complete audiences and wait for profiles.
      </div>
    )
  }

  const audienceColSpan = 2
  const colCount = 2 + bundles.length * audienceColSpan

  return (
    <div className="space-y-2">
      <div>
        <h3 className="text-sm font-medium">All channels</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Full RM taxonomy per audience. Reach and index sit side by side — the gap is the
          planning read. Group totals show reach only and are not scored. Search is modelled.
        </p>
      </div>
      <div className="overflow-x-auto rounded-card border border-border bg-card shadow-e1">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-2.5" rowSpan={2}>
                Channel
              </th>
              <th className="px-3 py-2.5" rowSpan={2}>
                Status
              </th>
              {bundles.map((b) => {
                const accent = AUDIENCE_ACCENTS[b.draft.colorIndex]!
                return (
                  <th
                    key={b.draft.id}
                    colSpan={audienceColSpan}
                    className="px-3 py-2.5 text-center"
                  >
                    <span className="inline-flex items-center gap-1.5 normal-case tracking-normal">
                      <span className={cn("h-2 w-2 rounded-full", accent.bg)} />
                      {b.draft.name}
                    </span>
                  </th>
                )
              })}
            </tr>
            <tr className="border-b border-border text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {bundles.map((b) => (
                <Fragment key={b.draft.id}>
                  <th className="px-3 py-1.5 text-right font-medium">Reach</th>
                  <th className="px-3 py-1.5 text-right font-medium">Index</th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <Fragment key={group.level1}>
                <tr className="border-b border-border bg-surface-panel">
                  <td
                    colSpan={colCount}
                    className="px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
                  >
                    {group.level1}
                  </td>
                </tr>
                {group.rows.map((templateRow) => {
                  const isRollup = templateRow.rowType === "rollup"
                  return (
                    <tr
                      key={templateRow.channelId}
                      className={cn(
                        "border-b border-border last:border-0",
                        isRollup && "bg-muted/20 text-muted-foreground"
                      )}
                    >
                      <td
                        className={cn(
                          "px-3 py-2.5",
                          isRollup ? "pl-3 font-medium" : "pl-5 font-normal"
                        )}
                      >
                        {templateRow.label}
                      </td>
                      <td className="px-3 py-2.5">
                        <TaxonomyStatusBadge row={templateRow} />
                      </td>
                      {bundles.map((b) => {
                        const row = findTaxonomyRow(b, templateRow)
                        const reach = row ? fmtReachPct(row.reachPct) : "—"
                        const index = row && !isRollup ? channelIndex(b, row) : null
                        return (
                          <Fragment key={b.draft.id}>
                            <td className="px-3 py-2.5 text-right">
                              <span className="num tabular-nums">{reach}</span>
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              {isRollup ? (
                                <span className="text-muted-foreground">—</span>
                              ) : (
                                <span className="num tabular-nums">
                                  {index == null ? "—" : index}
                                </span>
                              )}
                            </td>
                          </Fragment>
                        )
                      })}
                    </tr>
                  )
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function pickTaxonomySkeleton(bundles: AudienceCompareBundle[]): TaxonomyRow[] {
  for (const b of bundles) {
    const rows = b.adapted?.taxonomy
    if (rows && rows.length > 0) return rows
  }
  return []
}

function findTaxonomyRow(
  bundle: AudienceCompareBundle,
  template: TaxonomyRow
): TaxonomyRow | null {
  const rows = bundle.adapted?.taxonomy
  if (!rows) return null
  return (
    rows.find((r) => r.channelId === template.channelId) ??
    (template.engineChannelId
      ? (rows.find((r) => r.engineChannelId === template.engineChannelId) ?? null)
      : null)
  )
}

/** Affinity index for leaf / injected rows. Prefer scored affAvg (same as BCS), else engine aff. */
function channelIndex(bundle: AudienceCompareBundle, row: TaxonomyRow): number | null {
  if (row.rowType === "rollup") return null
  const engineId = row.engineChannelId ?? row.engine?.id
  if (engineId) {
    const scored = bundle.scored.find((s) => s.ch.id === engineId)
    if (scored) return Math.round(scored.affAvg)
  }
  if (row.engine) {
    const seg = effectiveSegmentId(bundle.draft.segmentId)
    const aff = row.engine.aff[seg]
    if (typeof aff === "number" && Number.isFinite(aff)) return Math.round(aff)
  }
  return null
}
