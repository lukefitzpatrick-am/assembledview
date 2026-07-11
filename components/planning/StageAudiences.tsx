"use client"

import { Plus, X } from "lucide-react"

import { AgeRangeSlider } from "@/app/tools/behavioural-planner/components/AgeRangeSlider"
import {
  bandsFromRange,
  formatAgeBandLabel,
  rangeFromBands,
  snapAgeRange,
} from "@/app/tools/behavioural-planner/lib/ageBands"
import type { Gender } from "@/components/planning/store"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { AdapterResult } from "@/lib/planning/adapter"
import type {
  PlanningAgeBand,
  PlanningSegment,
  PlanningState,
  ReachBasis,
} from "@/lib/planning/types"
import { PLANNING_STATES } from "@/lib/planning/types"
import { cn } from "@/lib/utils"
import { Info } from "lucide-react"
import { AUDIENCE_ACCENTS, MAX_AUDIENCES } from "./constants"
import {
  formatAudienceWc,
  pctOfUniverse,
  robustnessFromN,
} from "./robustness"
import {
  effectiveSegmentId,
  isBaseSegmentLens,
  type AudienceDraft,
} from "./store"

type AudienceResult = {
  adapted: AdapterResult | null
  loading: boolean
  error: string | null
}

type StageAudiencesProps = {
  audiences: AudienceDraft[]
  activeAudienceId: string
  segments: PlanningSegment[]
  results: Record<string, AudienceResult>
  onSelect: (id: string) => void
  onAdd: () => void
  onRemove: (id: string) => void
  onRename: (id: string, name: string) => void
  onPatch: (id: string, patch: Partial<AudienceDraft>) => void
  onContinue: () => void
}

const GENDERS: { id: Gender; label: string }[] = [
  { id: "all", label: "All" },
  { id: "female", label: "Female" },
  { id: "male", label: "Male" },
]

const STATE_LABELS: Record<PlanningState, string> = {
  NAT: "National",
  NSW: "NSW",
  VIC: "VIC",
  QLD: "QLD",
  SA: "SA",
  WA: "WA",
  TAS: "TAS",
  NT: "NT",
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border-0 bg-transparent p-0",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      )}
    >
      <Badge
        variant={active ? "info" : "outline"}
        size="sm"
        className={cn(
          "cursor-pointer border transition-colors",
          !active && "text-muted-foreground hover:bg-muted/80"
        )}
      >
        {children}
      </Badge>
    </button>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
      {children}
    </label>
  )
}

function topAffinities(adapted: AdapterResult | null, segmentId: string, n = 5) {
  if (!adapted) return []
  return [...adapted.channels]
    .map((ch) => ({
      id: ch.id,
      name: ch.name,
      aff: ch.aff[segmentId] ?? 100,
    }))
    .sort((a, b) => b.aff - a.aff)
    .slice(0, n)
}

function topSkewChannel(adapted: AdapterResult | null, segmentId: string): string | null {
  const top = topAffinities(adapted, segmentId, 1)[0]
  return top?.name ?? null
}

function LivePanel({
  draft,
  result,
  segments,
}: {
  draft: AudienceDraft
  result: AudienceResult | undefined
  segments: PlanningSegment[]
}) {
  const lensId = effectiveSegmentId(draft.segmentId)
  const lensLabel = isBaseSegmentLens(draft.segmentId)
    ? "All People"
    : segments.find((s) => s.segment_id === draft.segmentId)?.name ?? draft.segmentId
  const adapted = result?.adapted ?? null
  const audience_wc = adapted?.audienceWc ?? 0
  const unweighted_n = adapted?.unweightedN ?? 0
  const universe = adapted?.universeWc ?? 0
  const pct = pctOfUniverse(audience_wc, universe)
  const rob = robustnessFromN(unweighted_n)
  const affinities = topAffinities(adapted, lensId, 5)
  const show18 = draft.ageBands.includes("14-24")

  const robClass =
    rob.band === "bad"
      ? "bg-pacing-critical-bg text-status-critical-fg"
      : rob.band === "warn"
        ? "bg-pacing-behind-bg text-status-behind-fg"
        : "bg-pacing-ahead-bg text-status-ahead-fg"

  return (
    <div className="rounded-card border border-border bg-surface-panel p-4 shadow-e0">
      <h4 className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Live audience
      </h4>
      <p className="mb-3 text-sm font-medium">{lensLabel}</p>
      {result?.loading && !adapted ? (
        <p className="text-sm text-muted-foreground">Composing audience…</p>
      ) : result?.error && !adapted ? (
        <p className="text-sm text-status-critical-fg">{result.error}</p>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[11px] text-muted-foreground">Audience size</div>
              <div className="num text-lg font-medium tabular-nums">
                {formatAudienceWc(audience_wc)}
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  &apos;000s
                </span>
              </div>
              {/* Keep audience_wc / unweighted_n visible for verify + smoke. */}
              <div className="sr-only">
                audience_wc={audience_wc} unweighted_n={unweighted_n}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground">% of 14+ universe</div>
              <div className="num text-lg font-medium tabular-nums">
                {pct == null ? "—" : `${pct.toFixed(1)}%`}
              </div>
            </div>
          </div>

          <div className={cn("rounded-input px-3 py-2 text-xs", robClass)}>
            <span className="font-medium">{rob.label}</span>
            <span className="ml-1.5 opacity-90">{rob.detail}</span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {adapted && adapted.suppressedCells > 0 ? (
              <Badge variant="outline" size="sm" className="font-normal">
                {adapted.suppressedCells} thin-base cells excluded
              </Badge>
            ) : null}
            {show18 ? (
              <Badge variant="outline" size="sm" className="font-normal">
                Selection includes 14–24 · some channels are 18+ base
              </Badge>
            ) : null}
          </div>

          <div>
            <div className="mb-1.5 text-[11px] text-muted-foreground">
              Top affinity mini-profile
            </div>
            {affinities.length === 0 ? (
              <p className="text-xs text-muted-foreground">No channel affinities yet.</p>
            ) : (
              <ul className="space-y-1">
                {affinities.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center justify-between text-xs"
                  >
                    <span className="truncate">{a.name}</span>
                    <span className="num tabular-nums text-muted-foreground">
                      {Math.round(a.aff)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export function StageAudiences({
  audiences,
  activeAudienceId,
  segments,
  results,
  onSelect,
  onAdd,
  onRemove,
  onRename,
  onPatch,
  onContinue,
}: StageAudiencesProps) {
  const active = audiences.find((a) => a.id === activeAudienceId) ?? audiences[0]
  if (!active) return null

  const [ageLo, ageHi] = rangeFromBands(active.ageBands)
  // Segment lens optional — empty / base = All People; Continue only needs geo + age.
  const canContinue = audiences.every(
    (a) => a.states.length > 0 && a.ageBands.length > 0
  )

  const toggleState = (s: PlanningState) => {
    if (s === "NAT") {
      onPatch(active.id, { states: ["NAT"] })
      return
    }
    let next = active.states.filter((x) => x !== "NAT") as PlanningState[]
    if (next.includes(s)) next = next.filter((x) => x !== s)
    else next = [...next, s]
    if (next.length === 0) next = ["NAT"]
    onPatch(active.id, { states: next })
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-medium">Audiences</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Up to {MAX_AUDIENCES} audiences for side-by-side comparison. Each is one segment
          lens — never summed across audiences.
        </p>
      </div>

      {/* Audience tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {audiences.map((a) => {
          const accent = AUDIENCE_ACCENTS[a.colorIndex]!
          const isActive = a.id === active.id
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => onSelect(a.id)}
              className={cn(
                "interactive-tint flex items-center gap-2 rounded-pill border border-border px-3 py-1.5 text-xs transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isActive && "bg-card shadow-e1"
              )}
            >
              <span className={cn("h-2.5 w-2.5 rounded-full", accent.bg)} aria-hidden />
              <span className={cn(isActive && "font-medium")}>{a.name}</span>
              {audiences.length > 1 ? (
                <span
                  role="button"
                  tabIndex={0}
                  aria-label={`Remove ${a.name}`}
                  className="ml-0.5 rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={(e) => {
                    e.stopPropagation()
                    onRemove(a.id)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()
                      e.stopPropagation()
                      onRemove(a.id)
                    }
                  }}
                >
                  <X className="h-3 w-3" />
                </span>
              ) : null}
            </button>
          )
        })}
        {audiences.length < MAX_AUDIENCES ? (
          <Button type="button" variant="outline" size="sm" onClick={onAdd}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add audience
          </Button>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-card border border-border bg-card p-5 shadow-e1">
          <div className="mb-4 space-y-2">
            <FieldLabel>Audience name</FieldLabel>
            <Input
              value={active.name}
              onChange={(e) => onRename(active.id, e.target.value)}
            />
          </div>

          <div className="mb-4">
            <FieldLabel>Segment lens</FieldLabel>
            <p className="mb-2 text-[11px] text-muted-foreground">
              Optional lens — leave unset for All People (national base). Segments
              can&apos;t be combined.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {segments.map((s) => (
                <Chip
                  key={s.segment_id}
                  active={active.segmentId === s.segment_id}
                  onClick={() =>
                    onPatch(active.id, {
                      segmentId:
                        active.segmentId === s.segment_id ? "" : s.segment_id,
                    })
                  }
                >
                  {s.name}
                </Chip>
              ))}
            </div>
          </div>

          <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <FieldLabel>Age bands</FieldLabel>
              <AgeRangeSlider
                min={14}
                max={75}
                step={1}
                value={[ageLo, ageHi]}
                onChange={([lo, hi]) => {
                  const snapped = snapAgeRange(lo, hi)
                  onPatch(active.id, {
                    ageBands: bandsFromRange(snapped[0], snapped[1]) as PlanningAgeBand[],
                  })
                }}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Selected: {formatAgeBandLabel(active.ageBands)}
              </p>
            </div>
            <div>
              <FieldLabel>Gender</FieldLabel>
              <div className="flex flex-wrap gap-1.5">
                {GENDERS.map((g) => (
                  <Chip
                    key={g.id}
                    active={active.gender === g.id}
                    onClick={() => onPatch(active.id, { gender: g.id })}
                  >
                    {g.label}
                  </Chip>
                ))}
              </div>
            </div>
          </div>

          <div className="mb-4">
            <FieldLabel>States</FieldLabel>
            <div className="flex flex-wrap gap-1.5">
              {PLANNING_STATES.map((s) => (
                <Chip
                  key={s}
                  active={active.states.includes(s)}
                  onClick={() => toggleState(s)}
                >
                  {STATE_LABELS[s]}
                </Chip>
              ))}
            </div>
          </div>

          <div>
            <FieldLabel>
              <span className="inline-flex items-center gap-1">
                Reach basis
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex text-muted-foreground hover:text-foreground"
                        aria-label="About reach basis"
                      >
                        <Info className="h-3 w-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs text-xs">
                      Addressable = digitally buyable reach. Total = all measured reach.
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </span>
            </FieldLabel>
            <div className="flex flex-wrap gap-1.5">
              <Chip
                active={active.reachBasis === "addressable"}
                onClick={() => onPatch(active.id, { reachBasis: "addressable" as ReachBasis })}
              >
                Addressable
              </Chip>
              <Chip
                active={active.reachBasis === "total"}
                onClick={() => onPatch(active.id, { reachBasis: "total" as ReachBasis })}
              >
                Total
              </Chip>
            </div>
          </div>
        </div>

        <LivePanel draft={active} result={results[active.id]} segments={segments} />
      </div>

      {/* Comparison strip — never sums audience_wc across audiences */}
      <div>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Comparison strip
        </h3>
        <div className="grid gap-2 sm:grid-cols-3">
          {audiences.map((a) => {
            const accent = AUDIENCE_ACCENTS[a.colorIndex]!
            const r = results[a.id]?.adapted
            const rob = robustnessFromN(r?.unweightedN ?? 0)
            const skew = topSkewChannel(r ?? null, effectiveSegmentId(a.segmentId))
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => onSelect(a.id)}
                className={cn(
                  "interactive rounded-card border border-border bg-card p-3 text-left shadow-e0",
                  a.id === active.id && "ring-2 ring-ring"
                )}
              >
                <div className="mb-2 flex items-center gap-2">
                  <span className={cn("h-2 w-2 rounded-full", accent.bg)} />
                  <span className="truncate text-sm font-medium">{a.name}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  Size{" "}
                  <span className="num text-foreground">
                    {r ? formatAudienceWc(r.audienceWc) : "—"}
                  </span>
                  {" · "}n{" "}
                  <span className="num text-foreground">{rob.n || "—"}</span>
                </div>
                <div className="mt-1 truncate text-[11px] text-muted-foreground">
                  Top skew: {skew ?? "—"}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="button" disabled={!canContinue} onClick={onContinue}>
          Continue to diagnosis
        </Button>
      </div>
    </div>
  )
}
