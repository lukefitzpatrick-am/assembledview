"use client"

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react"

import {
  allocate,
  computeBcs,
} from "@/app/tools/behavioural-planner/lib/bcs-engine"
import { rangeFromBands } from "@/app/tools/behavioural-planner/lib/ageBands"
import { STATE_TO_GEO } from "@/app/tools/behavioural-planner/lib/data"
import type {
  Channel,
  GeoId,
  PlannerInputs,
  Weights as EngineWeights,
} from "@/app/tools/behavioural-planner/lib/types"
import { PlanningStepper } from "@/components/planning/PlanningStepper"
import { StageAudiences } from "@/components/planning/StageAudiences"
import { StageBrief } from "@/components/planning/StageBrief"
import { StageCompare, type AudienceCompareBundle } from "@/components/planning/StageCompare"
import { StageConstraints } from "@/components/planning/StageConstraints"
import { StageDiagnosis } from "@/components/planning/StageDiagnosis"
import {
  createInitialState,
  deriveBcsParams,
  isAudiencesComplete,
  isBriefComplete,
  planningReducer,
  type AudienceDraft,
} from "@/components/planning/store"
import type { StageId } from "@/components/planning/constants"
import { adaptAudienceToEngine, type AdapterResult } from "@/lib/planning/adapter"
import type {
  AudienceRequest,
  AudienceResponse,
  PlanningMeta,
  ReachBasis,
} from "@/lib/planning/types"
import { PLANNING_GENDERS } from "@/lib/planning/types"

const DEBOUNCE_MS = 350

type AudienceResult = {
  adapted: AdapterResult | null
  loading: boolean
  error: string | null
}

function defaultSegmentId(meta: PlanningMeta): string {
  return (
    meta.segments.find((s) => s.segment_id === "metro")?.segment_id ??
    meta.segments.find((s) => /metro|cap.?cit/i.test(s.name))?.segment_id ??
    meta.segments[0]?.segment_id ??
    ""
  )
}

function toAudienceRequest(
  waveId: string,
  draft: AudienceDraft
): AudienceRequest | null {
  if (!waveId || !draft.segmentId) return null
  if (draft.states.length === 0) return null
  const genders =
    draft.gender === "all"
      ? []
      : PLANNING_GENDERS.includes(draft.gender as (typeof PLANNING_GENDERS)[number])
        ? [draft.gender as (typeof PLANNING_GENDERS)[number]]
        : []
  return {
    wave_id: waveId,
    segment_id: draft.segmentId,
    states: draft.states,
    genders,
    age_bands: draft.ageBands,
    reach_basis: draft.reachBasis as ReachBasis,
  }
}

function audienceKey(waveId: string, draft: AudienceDraft): string {
  return [
    waveId,
    draft.id,
    draft.segmentId,
    draft.states.join(","),
    draft.ageBands.join(","),
    draft.gender,
    draft.reachBasis,
  ].join("|")
}

function toEngineChannels(adapted: AdapterResult, excluded: Set<string>): Channel[] {
  return adapted.channels
    .filter((c) => !excluded.has(c.id))
    .map((c) => ({
      id: c.id,
      name: c.name,
      attn: c.attn,
      B: c.B,
      D: c.D,
      cpm: c.cpm,
      color: c.color,
      aff: c.aff,
      ageMod: c.ageMod,
      genderMod: c.genderMod,
      reachPct: c.reachPct,
      reachWc: c.reachWc,
      isRmMeasured: c.isRmMeasured,
      ageBase: c.ageBase,
    }))
}

function toPlannerInputs(
  draft: AudienceDraft,
  objective: number,
  weights: EngineWeights,
  budget: number,
  flight: "q3-2026"
): PlannerInputs {
  const [ageMin, ageMax] = rangeFromBands(draft.ageBands)
  const geos: GeoId[] = draft.states.map((s) => STATE_TO_GEO[s] ?? "au")
  return {
    objective,
    segments: draft.segmentId ? [draft.segmentId] : [],
    weights,
    flight,
    budget,
    ageMin,
    ageMax: ageMax >= 75 ? 66 : ageMax,
    gender: draft.gender,
    geos: geos.length > 0 ? geos : ["au"],
  }
}

export function BehaviouralPlannerClient() {
  const [meta, setMeta] = useState<PlanningMeta | null>(null)
  const [metaError, setMetaError] = useState<string | null>(null)
  const [metaLoading, setMetaLoading] = useState(true)

  const [state, dispatch] = useReducer(
    planningReducer,
    null,
    () => createInitialState({ waveId: "", defaultSegmentId: "" })
  )

  const [results, setResults] = useState<Record<string, AudienceResult>>({})
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortMap = useRef<Map<string, AbortController>>(new Map())
  const genMap = useRef<Map<string, number>>(new Map())

  // Load meta once.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setMetaLoading(true)
      setMetaError(null)
      try {
        const res = await fetch("/api/planning/meta")
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null
          throw new Error(body?.error ?? `Meta request failed (${res.status})`)
        }
        const data = (await res.json()) as PlanningMeta
        if (cancelled) return
        setMeta(data)
        const waveId = data.waves[0]?.wave_id ?? ""
        const seg = defaultSegmentId(data)
        dispatch({ type: "RESET", waveId, defaultSegmentId: seg })
      } catch (err) {
        if (cancelled) return
        setMetaError(err instanceof Error ? err.message : "Failed to load planning meta")
      } finally {
        if (!cancelled) setMetaLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const fetchOne = useCallback(
    async (draft: AudienceDraft, currentMeta: PlanningMeta, waveId: string) => {
      const body = toAudienceRequest(waveId, draft)
      if (!body) return

      abortMap.current.get(draft.id)?.abort()
      const ac = new AbortController()
      abortMap.current.set(draft.id, ac)
      const gen = (genMap.current.get(draft.id) ?? 0) + 1
      genMap.current.set(draft.id, gen)

      setResults((prev) => ({
        ...prev,
        [draft.id]: {
          adapted: prev[draft.id]?.adapted ?? null,
          loading: true,
          error: null,
        },
      }))

      try {
        // One POST per audience (§8.3) — never sum audience_wc across audiences.
        const res = await fetch("/api/planning/audience", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: ac.signal,
        })
        if (!res.ok) {
          const errBody = (await res.json().catch(() => null)) as { error?: string } | null
          throw new Error(errBody?.error ?? `Audience request failed (${res.status})`)
        }
        const data = (await res.json()) as AudienceResponse
        if (genMap.current.get(draft.id) !== gen) return
        const next = adaptAudienceToEngine({
          audience: data,
          meta: currentMeta,
          segmentId: draft.segmentId,
        })
        setResults((prev) => ({
          ...prev,
          [draft.id]: { adapted: next, loading: false, error: null },
        }))
      } catch (err) {
        if (ac.signal.aborted) return
        if (genMap.current.get(draft.id) !== gen) return
        setResults((prev) => ({
          ...prev,
          [draft.id]: {
            adapted: null,
            loading: false,
            error: err instanceof Error ? err.message : "Failed to compose audience",
          },
        }))
      }
    },
    []
  )

  const keysSignature = state.audiences
    .map((a) => audienceKey(state.waveId, a))
    .join("||")

  // Debounced multi-audience fetch — one request per audience definition.
  useEffect(() => {
    if (!meta || !state.waveId) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      for (const draft of state.audiences) {
        void fetchOne(draft, meta, state.waveId)
      }
      // Drop results for removed audiences
      setResults((prev) => {
        const keep = new Set(state.audiences.map((a) => a.id))
        const next: Record<string, AudienceResult> = {}
        for (const [id, r] of Object.entries(prev)) {
          if (keep.has(id)) next[id] = r
        }
        return next
      })
    }, DEBOUNCE_MS)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
    // keysSignature captures audience definition slice
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta, keysSignature, fetchOne])

  const bcsParams = useMemo(() => deriveBcsParams(state.diagnosis), [state.diagnosis])
  const excluded = useMemo(
    () => new Set(state.excludedChannelIds),
    [state.excludedChannelIds]
  )

  const constraintChannels = useMemo(() => {
    const map = new Map<string, string>()
    for (const a of state.audiences) {
      const adapted = results[a.id]?.adapted
      if (!adapted) continue
      for (const ch of adapted.channels) {
        if (!map.has(ch.id)) map.set(ch.id, ch.name)
      }
    }
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [state.audiences, results])

  const compareBundles: AudienceCompareBundle[] = useMemo(() => {
    const weights = bcsParams.weights as EngineWeights
    return state.audiences.map((draft) => {
      const result = results[draft.id]
      const adapted = result?.adapted ?? null
      let allocated: AudienceCompareBundle["allocated"] = []
      if (adapted) {
        const inputs = toPlannerInputs(
          draft,
          bcsParams.objective,
          weights,
          state.brief.budget,
          "q3-2026"
        )
        const channels = toEngineChannels(adapted, excluded)
        const scored = computeBcs(inputs, channels)
        allocated = allocate(scored, state.brief.budget)
      }
      return {
        draft,
        adapted,
        allocated,
        loading: result?.loading ?? false,
        error: result?.error ?? null,
      }
    })
  }, [state.audiences, state.brief.budget, results, bcsParams, excluded])

  const goTo = (stage: StageId) => {
    dispatch({ type: "SET_STAGE", stage })
  }

  const completeAndGo = (from: StageId, to: StageId) => {
    dispatch({ type: "COMPLETE_STAGE", stage: from })
    dispatch({ type: "SET_STAGE", stage: to })
  }

  const handleStepperSelect = (stage: StageId) => {
    if (state.completed[stage] || stage === state.stage) {
      goTo(stage)
    }
  }

  const handleReset = () => {
    if (!meta) return
    dispatch({
      type: "RESET",
      waveId: meta.waves[0]?.wave_id ?? "",
      defaultSegmentId: defaultSegmentId(meta),
    })
    setResults({})
  }

  if (metaLoading) {
    return (
      <div className="container mx-auto max-w-5xl px-6 py-8">
        <p className="text-sm text-muted-foreground">Loading planning catalogue…</p>
      </div>
    )
  }

  if (metaError || !meta) {
    return (
      <div className="container mx-auto max-w-5xl px-6 py-8">
        <div className="rounded-lg border border-status-critical-fg/30 bg-pacing-critical-bg px-4 py-6 text-sm text-status-critical-fg">
          <p className="font-medium">Could not load planning meta</p>
          <p className="mt-1 text-xs opacity-90">{metaError ?? "Unknown error"}</p>
        </div>
      </div>
    )
  }

  const waveLabel =
    meta.waves.find((w) => w.wave_id === state.waveId)?.label ||
    state.waveId ||
    "—"

  const reachBasisLabel =
    state.audiences[0]?.reachBasis === "total" ? "Total" : "Addressable"

  return (
    <div className="container mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6 flex items-baseline justify-between border-b border-border pb-3">
        <div>
          <h1 className="text-xl font-medium">
            Demand Flow planner
            <span className="ml-2 text-[11px] font-normal text-muted-foreground">
              five-stage · live Roy Morgan
            </span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Brief → audiences → diagnosis → constraints → compare. Wave {waveLabel}.
          </p>
        </div>
        <button
          type="button"
          onClick={handleReset}
          className="text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
        >
          Reset
        </button>
      </div>

      <PlanningStepper
        stage={state.stage}
        completed={state.completed}
        onSelect={handleStepperSelect}
      />

      {state.stage === "brief" ? (
        <StageBrief
          brief={state.brief}
          onPatch={(patch) => dispatch({ type: "PATCH_BRIEF", patch })}
          onObjective={(kind) => dispatch({ type: "SET_OBJECTIVE", kind })}
          onContinue={() => {
            if (!isBriefComplete(state.brief)) return
            completeAndGo("brief", "audiences")
          }}
        />
      ) : null}

      {state.stage === "audiences" ? (
        <StageAudiences
          audiences={state.audiences}
          activeAudienceId={state.activeAudienceId}
          segments={meta.segments}
          results={results}
          onSelect={(id) => dispatch({ type: "SET_ACTIVE_AUDIENCE", id })}
          onAdd={() => dispatch({ type: "ADD_AUDIENCE" })}
          onRemove={(id) => dispatch({ type: "REMOVE_AUDIENCE", id })}
          onRename={(id, name) => dispatch({ type: "RENAME_AUDIENCE", id, name })}
          onPatch={(id, patch) => dispatch({ type: "PATCH_AUDIENCE", id, patch })}
          onContinue={() => {
            if (!isAudiencesComplete(state.audiences)) return
            completeAndGo("audiences", "diagnosis")
          }}
        />
      ) : null}

      {state.stage === "diagnosis" ? (
        <StageDiagnosis
          diagnosis={state.diagnosis}
          onPatch={(patch) => dispatch({ type: "PATCH_DIAGNOSIS", patch })}
          onBack={() => goTo("audiences")}
          onContinue={() => completeAndGo("diagnosis", "constraints")}
        />
      ) : null}

      {state.stage === "constraints" ? (
        <StageConstraints
          channels={constraintChannels}
          excludedChannelIds={state.excludedChannelIds}
          onToggle={(id) => dispatch({ type: "TOGGLE_CHANNEL", engineChannelId: id })}
          onBack={() => goTo("diagnosis")}
          onContinue={() => completeAndGo("constraints", "compare")}
        />
      ) : null}

      {state.stage === "compare" ? (
        <StageCompare
          brief={state.brief}
          diagnosis={state.diagnosis}
          waveLabel={waveLabel}
          reachBasis={reachBasisLabel}
          bundles={compareBundles}
          onBack={() => goTo("constraints")}
        />
      ) : null}
    </div>
  )
}
