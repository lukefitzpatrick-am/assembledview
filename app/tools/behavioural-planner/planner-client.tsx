"use client"

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react"
import { usePathname } from "next/navigation"

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
import { MethodologyPanel } from "@/components/planning/MethodologyPanel"
import { AvaPlanningInsightAction } from "@/components/ava/AvaSkillActionSets"
import { PlanningStepper } from "@/components/planning/PlanningStepper"
import { robustnessFromN } from "@/components/planning/robustness"
import { StageAudiences } from "@/components/planning/StageAudiences"
import { StageBrief } from "@/components/planning/StageBrief"
import {
  StageCompare,
  type AudienceCompareBundle,
  type SavedAudienceDefinition,
} from "@/components/planning/StageCompare"
import { StageConstraints } from "@/components/planning/StageConstraints"
import { StageDiagnosis } from "@/components/planning/StageDiagnosis"
import {
  createAudienceDraft,
  createInitialState,
  deriveBcsParams,
  effectiveSegmentId,
  isAudiencesComplete,
  isBriefComplete,
  planningReducer,
  type AudienceDraft,
  type BriefState,
  type DiagnosisState,
} from "@/components/planning/store"
import type { StageId } from "@/components/planning/constants"
import { useToast } from "@/components/ui/use-toast"
import { setAssistantContext, clearAssistantContext } from "@/lib/assistantBridge"
import type { PageContext } from "@/lib/ava/types"
import { adaptAudienceToEngine, type AdapterResult } from "@/lib/planning/adapter"
import { resolveEngineParams } from "@/lib/planning/engineParams"
import type { PlanningAudienceRow } from "@/lib/planning/audienceTypes"
import type {
  AudienceRequest,
  AudienceResponse,
  PlanningMeta,
  ReachBasis,
} from "@/lib/planning/types"
import { PLANNING_GENDERS } from "@/lib/planning/types"

const DEBOUNCE_MS = 350
const AVA_LIST_CAP = 20
const AVA_TEXT_CAP = 200

function avaTruncate(value: unknown, max = AVA_TEXT_CAP): string {
  const s = value == null ? "" : String(value)
  if (s.length <= max) return s
  return `${s.slice(0, max - 1)}…`
}

type AudienceResult = {
  adapted: AdapterResult | null
  loading: boolean
  error: string | null
}

function defaultSegmentId(_meta: PlanningMeta): string {
  return "base"
}

function toAudienceRequest(
  waveId: string,
  draft: AudienceDraft
): AudienceRequest | null {
  if (!waveId) return null
  if (draft.states.length === 0) return null
  const genders =
    draft.gender === "all"
      ? []
      : PLANNING_GENDERS.includes(draft.gender as (typeof PLANNING_GENDERS)[number])
        ? [draft.gender as (typeof PLANNING_GENDERS)[number]]
        : []
  return {
    wave_id: waveId,
    segment_id: effectiveSegmentId(draft.segmentId),
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
    effectiveSegmentId(draft.segmentId),
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
    segments: [effectiveSegmentId(draft.segmentId)],
    weights,
    flight,
    budget,
    ageMin,
    ageMax: ageMax >= 75 ? 66 : ageMax,
    gender: draft.gender,
    geos: geos.length > 0 ? geos : ["au"],
  }
}

function parseSavedDefinition(raw: unknown): SavedAudienceDefinition | null {
  if (!raw || typeof raw !== "object") return null
  const o = raw as Record<string, unknown>
  if (!o.audience || typeof o.audience !== "object") return null
  const audience = o.audience as AudienceDraft
  if (!audience.id || !audience.name || !audience.segmentId) return null
  return {
    audience: createAudienceDraft({
      ...audience,
      colorIndex: (audience.colorIndex ?? 0) as 0 | 1 | 2,
      segmentId: audience.segmentId,
      id: audience.id,
    }),
    brief: (o.brief && typeof o.brief === "object" ? o.brief : {}) as BriefState,
    diagnosis: (o.diagnosis && typeof o.diagnosis === "object"
      ? o.diagnosis
      : {
          penetration: 35,
          target: 45,
          salience: "medium",
          createCapture: 35,
          weights: { A: 30, T: 25, E: 30, C: 15 },
        }) as DiagnosisState,
    exclusions: Array.isArray(o.exclusions)
      ? o.exclusions.map((x) => String(x))
      : [],
    wave_id: typeof o.wave_id === "string" ? o.wave_id : "",
  }
}

function briefClientId(
  fromSaved: BriefState,
  current: BriefState
): number | null {
  if (typeof fromSaved.clientId === "number") return fromSaved.clientId
  return current.clientId
}

export function BehaviouralPlannerClient() {
  const pathname = usePathname()
  const { toast } = useToast()
  const [meta, setMeta] = useState<PlanningMeta | null>(null)
  const [metaError, setMetaError] = useState<string | null>(null)
  const [metaLoading, setMetaLoading] = useState(true)
  const [methodologyOpen, setMethodologyOpen] = useState(false)
  const [methodologyFocusId, setMethodologyFocusId] = useState<string | null>(null)

  const [state, dispatch] = useReducer(
    planningReducer,
    null,
    () => createInitialState({ waveId: "", defaultSegmentId: "" })
  )

  const [results, setResults] = useState<Record<string, AudienceResult>>({})
  const [savedAudiences, setSavedAudiences] = useState<PlanningAudienceRow[]>([])
  const [savedLoading, setSavedLoading] = useState(false)
  const [savedRefresh, setSavedRefresh] = useState(0)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortMap = useRef<Map<string, AbortController>>(new Map())
  const genMap = useRef<Map<string, number>>(new Map())

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
        setMeta({
          ...data,
          methodology: data.methodology ?? [],
          engine_params: data.engine_params ?? {},
        })
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

  useEffect(() => {
    const clientId = state.brief.clientId
    if (!clientId) {
      setSavedAudiences([])
      return
    }
    let cancelled = false
    ;(async () => {
      setSavedLoading(true)
      try {
        const res = await fetch(
          `/api/planning/audiences?clients_id=${encodeURIComponent(String(clientId))}`
        )
        if (!res.ok) throw new Error(`Failed to list audiences (${res.status})`)
        const rows = (await res.json()) as PlanningAudienceRow[]
        if (!cancelled) setSavedAudiences(Array.isArray(rows) ? rows : [])
      } catch {
        if (!cancelled) setSavedAudiences([])
      } finally {
        if (!cancelled) setSavedLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [state.brief.clientId, state.stage, savedRefresh])

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
          segmentId: effectiveSegmentId(draft.segmentId),
        })
        if (process.env.NODE_ENV === "development") {
          console.info("[planner] skippedEngineIds", next.skippedEngineIds)
          console.info(
            "[planner] leaf rows without engine",
            next.taxonomy
              .filter((r) => r.rowType === "leaf" && !r.engine)
              .map((r) => ({
                id: r.channelId,
                engineId: r.engineChannelId,
                label: r.label,
              }))
          )
        }
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

  useEffect(() => {
    if (!meta || !state.waveId) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      for (const draft of state.audiences) {
        void fetchOne(draft, meta, state.waveId)
      }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta, keysSignature, fetchOne])

  const engineParams = useMemo(
    () => resolveEngineParams(meta?.engine_params),
    [meta?.engine_params]
  )

  const bcsParams = useMemo(
    () => deriveBcsParams(state.diagnosis, engineParams),
    [state.diagnosis, engineParams]
  )
  const excluded = useMemo(
    () => new Set(state.excludedChannelIds),
    [state.excludedChannelIds]
  )

  const constraintChannels = useMemo(() => {
    type Entry = { id: string; name: string; group: string; sortOrder: number }
    const map = new Map<string, Entry>()
    const groupFirstOrder = new Map<string, number>()

    for (const a of state.audiences) {
      const adapted = results[a.id]?.adapted
      if (!adapted) continue
      for (const row of adapted.taxonomy) {
        if (row.rowType === "rollup" || !row.engine) continue
        const prevGroupOrder = groupFirstOrder.get(row.level1)
        if (prevGroupOrder == null || row.sortOrder < prevGroupOrder) {
          groupFirstOrder.set(row.level1, row.sortOrder)
        }
        if (map.has(row.engine.id)) continue
        map.set(row.engine.id, {
          id: row.engine.id,
          name: row.engine.name,
          group: row.level1,
          sortOrder: row.sortOrder,
        })
      }
    }

    return [...map.values()]
      .sort((a, b) => {
        const aGroup = groupFirstOrder.get(a.group) ?? a.sortOrder
        const bGroup = groupFirstOrder.get(b.group) ?? b.sortOrder
        if (aGroup !== bGroup) return aGroup - bGroup
        if (a.group !== b.group) return a.group.localeCompare(b.group)
        return a.sortOrder - b.sortOrder
      })
      .map(({ id, name, group }) => ({ id, name, group }))
  }, [state.audiences, results])

  const compareBundles: AudienceCompareBundle[] = useMemo(() => {
    const weights = bcsParams.weights as EngineWeights
    return state.audiences.map((draft) => {
      const result = results[draft.id]
      const adapted = result?.adapted ?? null
      let allocated: AudienceCompareBundle["allocated"] = []
      let scored: AudienceCompareBundle["scored"] = []
      if (adapted) {
        const inputs = toPlannerInputs(
          draft,
          bcsParams.objective,
          weights,
          state.brief.budget,
          "q3-2026"
        )
        const channels = toEngineChannels(adapted, excluded)
        scored = computeBcs(inputs, channels, engineParams)
        allocated = allocate(scored, state.brief.budget, engineParams)
      }
      return {
        draft,
        adapted,
        scored,
        allocated,
        loading: result?.loading ?? false,
        error: result?.error ?? null,
      }
    })
  }, [state.audiences, state.brief.budget, results, bcsParams, excluded, engineParams])

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

  const handleLoadSaved = (row: PlanningAudienceRow) => {
    const parsed = parseSavedDefinition(row.definition_json)
    if (!parsed) {
      toast({
        title: "Could not load audience",
        description: "Saved definition_json is missing required fields.",
        variant: "destructive",
      })
      return
    }
    dispatch({
      type: "LOAD_SAVED",
      waveId: parsed.wave_id || state.waveId,
      brief: {
        clientId: briefClientId(parsed.brief, state.brief),
        clientName: parsed.brief.clientName || state.brief.clientName,
        brandOverride: parsed.brief.brandOverride ?? state.brief.brandOverride,
        campaignName: parsed.brief.campaignName || state.brief.campaignName,
        startDate: parsed.brief.startDate ?? state.brief.startDate,
        endDate: parsed.brief.endDate ?? state.brief.endDate,
        category: parsed.brief.category || state.brief.category,
        market: parsed.brief.market || state.brief.market,
        budget: parsed.brief.budget || state.brief.budget,
        objectiveKind: parsed.brief.objectiveKind ?? state.brief.objectiveKind,
      },
      audiences: [parsed.audience],
      activeAudienceId: parsed.audience.id,
      diagnosis: parsed.diagnosis,
      excludedChannelIds: parsed.exclusions,
    })
    toast({
      title: `Loaded “${row.name}”`,
      description: "Builder restored from the saved definition.",
    })
  }

  const getPageContext = useCallback((): PageContext => {
    const audiences = state.audiences.slice(0, AVA_LIST_CAP).map((a) => {
      const adapted = results[a.id]?.adapted
      const rob = robustnessFromN(adapted?.unweightedN ?? 0)
      return {
        id: a.id,
        name: avaTruncate(a.name, 80),
        reachBasis: a.reachBasis,
        states: a.states.slice(0, 8),
        audienceWc: adapted?.audienceWc ?? null,
        unweightedN: rob.n,
        robustnessBand: rob.band,
        robustnessLabel: rob.label,
      }
    })
    const active = state.audiences.find((a) => a.id === state.activeAudienceId)

    return {
      route: { pathname: pathname || "/tools/behavioural-planner" },
      generatedAt: new Date().toISOString(),
      entities: {
        clientName: state.brief.clientName || undefined,
        campaignName: state.brief.campaignName || undefined,
      },
      pageText: {
        title: "Demand Flow planner",
        breadcrumbs: ["Tools", "Planning"],
      },
      state: {
        surface: "planning",
        stage: state.stage,
        waveId: state.waveId || null,
        brief: {
          clientId: state.brief.clientId,
          clientName: avaTruncate(state.brief.clientName, 80),
          startDate: state.brief.startDate,
          endDate: state.brief.endDate,
          budget: state.brief.budget,
          objectiveKind: state.brief.objectiveKind,
        },
        activeAudienceId: state.activeAudienceId,
        activeReachBasis: active?.reachBasis ?? null,
        audienceCount: state.audiences.length,
        audiences,
      },
    }
  }, [pathname, results, state])

  useEffect(() => {
    setAssistantContext({ pageContext: getPageContext() })
  }, [getPageContext])

  useEffect(() => {
    return () => {
      clearAssistantContext()
    }
  }, [])

  if (metaLoading) {
    return (
      <div className="container mx-auto max-w-5xl 2xl:max-w-7xl px-6 py-8">
        <p className="text-sm text-muted-foreground">Loading planning catalogue…</p>
      </div>
    )
  }

  if (metaError || !meta) {
    return (
      <div className="container mx-auto max-w-5xl 2xl:max-w-7xl px-6 py-8">
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
    <div className="container mx-auto max-w-5xl 2xl:max-w-7xl px-6 py-8">
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
        <div className="flex items-center gap-2">
          <AvaPlanningInsightAction />
          <MethodologyPanel
            rows={meta.methodology}
            open={methodologyOpen}
            onOpenChange={(open) => {
              setMethodologyOpen(open)
              if (!open) setMethodologyFocusId(null)
            }}
            focusId={methodologyFocusId}
            showTrigger
          />
          <button
            type="button"
            onClick={handleReset}
            className="text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
          >
            Reset
          </button>
        </div>
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
          taxonomy={
            results[state.activeAudienceId]?.adapted?.taxonomy ?? []
          }
          taxonomyLoading={Boolean(results[state.activeAudienceId]?.loading)}
          taxonomyError={results[state.activeAudienceId]?.error ?? null}
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
          waveId={state.waveId}
          waveLabel={waveLabel}
          reachBasis={reachBasisLabel}
          excludedChannelIds={state.excludedChannelIds}
          bundles={compareBundles}
          savedAudiences={savedAudiences}
          savedLoading={savedLoading}
          onOpenMethodology={(focusId) => {
            setMethodologyFocusId(focusId ?? null)
            setMethodologyOpen(true)
          }}
          onLoadSaved={handleLoadSaved}
          onAudienceSaved={() => setSavedRefresh((n) => n + 1)}
          onBack={() => goTo("constraints")}
        />
      ) : null}
    </div>
  )
}
