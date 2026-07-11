"use client"

import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { cn } from "@/lib/utils"
import { SALIENCE_OPTIONS, type SalienceLevel } from "./constants"
import type { DiagnosisState } from "./store"

type StageDiagnosisProps = {
  diagnosis: DiagnosisState
  onPatch: (patch: Partial<DiagnosisState>) => void
  onContinue: () => void
  onBack: () => void
}

/**
 * Stage C → BCS mapping (v1 — engine params from Snowflake in R2):
 * - Create↔Capture slider → BCS `objective` (0=brand/create … 100=action/capture)
 * - Objective cards (Stage A) seed createCapture + A/T/E/C weight presets
 * - Penetration / target / salience nudge weights via deriveBcsParams in store.ts
 * - No engine/compose maths changes — only input derivation for computeBcs
 */
export function StageDiagnosis({
  diagnosis,
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
          not a separate engine.
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
              className="h-full bg-channel-tv transition-[width]"
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
