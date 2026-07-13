"use client"

import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { cn } from "@/lib/utils"
import type { TaxonomyRow } from "@/lib/planning/adapter"
import { SALIENCE_OPTIONS, type SalienceLevel } from "./constants"
import type { DiagnosisState } from "./store"
import { TaxonomyStatusBadge } from "./TaxonomyStatusBadge"
import {
  fmtReachPct,
  groupTaxonomy,
  type TaxonomyGroup,
} from "./taxonomyGrouping"

type StageDiagnosisProps = {
  diagnosis: DiagnosisState
  /** Active audience taxonomy (leaves + rollups + Search). Empty while loading. */
  taxonomy: TaxonomyRow[]
  taxonomyLoading?: boolean
  taxonomyError?: string | null
  onPatch: (patch: Partial<DiagnosisState>) => void
  onContinue: () => void
  onBack: () => void
}

function ChannelTaxonomyTable({ rows }: { rows: TaxonomyRow[] }) {
  const groups = groupTaxonomy(rows)
  if (groups.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Compose an audience in Stage B to see channel reach.
      </p>
    )
  }

  return (
    <div className="overflow-hidden rounded-card border border-border">
      <table className="w-full caption-bottom text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40">
            <th className="h-10 px-3 text-left align-middle text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Channel
            </th>
            <th className="h-10 px-3 text-right align-middle text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              RM reach
            </th>
            <th className="h-10 px-3 text-left align-middle text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <GroupRows key={group.level1} group={group} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function GroupRows({ group }: { group: TaxonomyGroup }) {
  return (
    <>
      <tr className="border-b border-border bg-surface-panel">
        <td
          colSpan={3}
          className="px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
        >
          {group.level1}
        </td>
      </tr>
      {group.rows.map((row) => {
        const isRollup = row.rowType === "rollup"
        return (
          <tr
            key={row.channelId}
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
              <span className="inline-flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span>{row.label}</span>
                {isRollup ? (
                  <span className="text-[10px] font-normal uppercase tracking-wider text-muted-foreground">
                    Group total
                  </span>
                ) : null}
              </span>
            </td>
            <td className="px-3 py-2.5 text-right">
              <span className="num tabular-nums">{fmtReachPct(row.reachPct)}</span>
            </td>
            <td className="px-3 py-2.5">
              <TaxonomyStatusBadge row={row} />
            </td>
          </tr>
        )
      })}
    </>
  )
}

/**
 * Stage C → BCS mapping (v1 — engine params from Snowflake in R2):
 * - Create↔Capture slider → BCS `objective` (0=brand/create … 100=action/capture)
 * - Objective cards (Stage A) seed createCapture + A/T/E/C weight presets
 * - Penetration / target / salience nudge weights via deriveBcsParams in store.ts
 * - Channel taxonomy table is display-only (rollups not scored; Search modelled)
 * - No engine/compose maths changes — only input derivation for computeBcs
 */
export function StageDiagnosis({
  diagnosis,
  taxonomy,
  taxonomyLoading,
  taxonomyError,
  onPatch,
  onContinue,
  onBack,
}: StageDiagnosisProps) {
  const createShare = 100 - diagnosis.createCapture
  const captureShare = diagnosis.createCapture

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-medium">Demand diagnosis</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Penetration, ambition, and Create↔Capture bias map onto existing BCS weights —
          not a separate engine. Channel reach below is for context only.
        </p>
      </div>

      <div className="rounded-card border border-border bg-card p-5 shadow-e1 space-y-6">
        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Category penetration
            </label>
            <span className="num text-sm tabular-nums">{diagnosis.penetration}%</span>
          </div>
          <Slider
            min={0}
            max={100}
            step={1}
            value={[diagnosis.penetration]}
            onValueChange={(v) => onPatch({ penetration: v[0] ?? diagnosis.penetration })}
          />
        </div>

        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Target / ambition
            </label>
            <span className="num text-sm tabular-nums">{diagnosis.target}%</span>
          </div>
          <Slider
            min={0}
            max={100}
            step={1}
            value={[diagnosis.target]}
            onValueChange={(v) => onPatch({ target: v[0] ?? diagnosis.target })}
          />
        </div>

        <div>
          <label className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Brand salience
          </label>
          <div className="flex flex-wrap gap-1.5">
            {SALIENCE_OPTIONS.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => onPatch({ salience: o.id as SalienceLevel })}
                className={cn(
                  "rounded-pill border border-border px-3 py-1 text-xs transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  diagnosis.salience === o.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-card text-muted-foreground hover:bg-muted/80"
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Create ↔ Capture
            </label>
            <span className="text-xs text-muted-foreground">
              <span className="num tabular-nums">{createShare}</span>:
              <span className="num tabular-nums">{captureShare}</span>
            </span>
          </div>
          <Slider
            min={0}
            max={100}
            step={1}
            value={[diagnosis.createCapture]}
            onValueChange={(v) =>
              onPatch({ createCapture: v[0] ?? diagnosis.createCapture })
            }
          />
          {/* Split bar — Create (brand) | Capture (action) */}
          <div className="mt-3 flex h-3 overflow-hidden rounded-pill bg-[var(--fill-track)]">
            <div
              className="h-full bg-channel-search transition-[width]"
              style={{ width: `${createShare}%` }}
              title="Create"
            />
            <div
              className="h-full bg-audience-1 transition-[width]"
              style={{ width: `${captureShare}%` }}
              title="Capture"
            />
          </div>
          <div className="mt-1.5 flex justify-between text-[10px] text-muted-foreground">
            <span>Create (brand)</span>
            <span>Capture (action)</span>
          </div>
        </div>
      </div>

      <div className="rounded-card border border-border bg-card p-5 shadow-e1 space-y-3">
        <div>
          <h3 className="text-sm font-medium">Channel reach</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Full RM taxonomy for the active audience. Group totals show reach only (no
            status badge) and are excluded from BCS, DFII, and allocation. Search is
            modelled, not Roy Morgan measured.
          </p>
        </div>
        {taxonomyLoading && taxonomy.length === 0 ? (
          <p className="text-sm text-muted-foreground">Loading channel reach…</p>
        ) : taxonomyError && taxonomy.length === 0 ? (
          <p className="text-sm text-status-critical-fg">{taxonomyError}</p>
        ) : (
          <ChannelTaxonomyTable rows={taxonomy} />
        )}
      </div>

      <div className="flex justify-between">
        <Button type="button" variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button type="button" onClick={onContinue}>
          Continue to constraints
        </Button>
      </div>
    </div>
  )
}
