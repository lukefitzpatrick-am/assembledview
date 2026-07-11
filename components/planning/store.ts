import type {
  PlanningAgeBand,
  PlanningState,
  ReachBasis,
} from "@/lib/planning/types"
import {
  MAX_AUDIENCES,
  OBJECTIVE_PRESETS,
  type ObjectiveKind,
  type SalienceLevel,
  type StageId,
  type Weights,
} from "./constants"

export type Gender = "all" | "female" | "male"

export type BriefState = {
  clientId: number | null
  clientName: string
  brandOverride: string
  campaignName: string
  startDate: string | null
  endDate: string | null
  category: string
  /** Informational only in v1 — states chosen per audience in Stage B. */
  market: string
  budget: number
  objectiveKind: ObjectiveKind | null
}

export type AudienceDraft = {
  id: string
  name: string
  colorIndex: 0 | 1 | 2
  segmentId: string
  states: PlanningState[]
  gender: Gender
  ageBands: PlanningAgeBand[]
  reachBasis: ReachBasis
}

export type DiagnosisState = {
  /** Category penetration 0–100. */
  penetration: number
  /** Target share / ambition 0–100. */
  target: number
  salience: SalienceLevel
  /**
   * Create↔Capture slider 0–100.
   * Maps directly onto BCS `objective` (0 = brand/create, 100 = action/capture).
   */
  createCapture: number
  /** Optional fine-tune of A/T/E/C after objective preset. */
  weights: Weights
}

export type PlanningWorkflowState = {
  stage: StageId
  /** Stages the user has completed (stepper clickable). */
  completed: Record<StageId, boolean>
  waveId: string
  brief: BriefState
  audiences: AudienceDraft[]
  activeAudienceId: string
  diagnosis: DiagnosisState
  /** Engine channel ids excluded from scoring + compare table. */
  excludedChannelIds: string[]
}

export type PlanningAction =
  | { type: "SET_STAGE"; stage: StageId }
  | { type: "COMPLETE_STAGE"; stage: StageId }
  | { type: "SET_WAVE"; waveId: string }
  | { type: "PATCH_BRIEF"; patch: Partial<BriefState> }
  | { type: "SET_OBJECTIVE"; kind: ObjectiveKind }
  | { type: "SET_ACTIVE_AUDIENCE"; id: string }
  | { type: "ADD_AUDIENCE" }
  | { type: "REMOVE_AUDIENCE"; id: string }
  | { type: "RENAME_AUDIENCE"; id: string; name: string }
  | { type: "PATCH_AUDIENCE"; id: string; patch: Partial<AudienceDraft> }
  | { type: "PATCH_DIAGNOSIS"; patch: Partial<DiagnosisState> }
  | { type: "TOGGLE_CHANNEL"; engineChannelId: string }
  | { type: "SET_EXCLUDED"; ids: string[] }
  | { type: "RESET"; waveId: string; defaultSegmentId: string }

let audienceSeq = 1

function nextAudienceId(): string {
  return `aud-${audienceSeq++}`
}

export function createAudienceDraft(
  over: Partial<AudienceDraft> & Pick<AudienceDraft, "colorIndex" | "segmentId">
): AudienceDraft {
  const n = over.colorIndex + 1
  return {
    id: over.id ?? nextAudienceId(),
    name: over.name ?? `Audience ${n}`,
    colorIndex: over.colorIndex,
    segmentId: over.segmentId,
    states: over.states ?? ["NAT"],
    gender: over.gender ?? "all",
    ageBands: over.ageBands ?? ["25-34", "35-49"],
    reachBasis: over.reachBasis ?? "addressable",
  }
}

export function createInitialState(opts: {
  waveId: string
  defaultSegmentId: string
}): PlanningWorkflowState {
  audienceSeq = 1
  const first = createAudienceDraft({
    colorIndex: 0,
    segmentId: opts.defaultSegmentId,
  })
  return {
    stage: "brief",
    completed: {
      brief: false,
      audiences: false,
      diagnosis: false,
      constraints: false,
      compare: false,
    },
    waveId: opts.waveId,
    brief: {
      clientId: null,
      clientName: "",
      brandOverride: "",
      campaignName: "",
      startDate: null,
      endDate: null,
      category: "FMCG",
      market: "Australia",
      budget: 850_000,
      objectiveKind: null,
    },
    audiences: [first],
    activeAudienceId: first.id,
    diagnosis: {
      penetration: 35,
      target: 45,
      salience: "medium",
      createCapture: 35,
      weights: { ...OBJECTIVE_PRESETS.consideration.weights },
    },
    excludedChannelIds: [],
  }
}

/**
 * Stage C → BCS mapping (v1 client-side; Snowflake engine params arrive in R2).
 *
 * - `createCapture` → `objective` (Create=brand … Capture=action)
 * - Objective cards set createCapture + base weight presets
 * - Salience nudges Attention (T); target−penetration gap nudges Audience fit (A);
 *   capture-heavy createCapture nudges Cost (C)
 * Engine formula in bcs-engine.ts is unchanged — we only derive its inputs.
 */
export function deriveBcsParams(diagnosis: DiagnosisState): {
  objective: number
  weights: Weights
} {
  const gap = Math.max(0, diagnosis.target - diagnosis.penetration)
  const salienceBoost = diagnosis.salience === "high" ? 8 : diagnosis.salience === "low" ? -6 : 0
  const gapBoost = Math.min(12, Math.round(gap * 0.25))
  const captureBoost = diagnosis.createCapture >= 60 ? 6 : diagnosis.createCapture <= 30 ? -4 : 0

  const base = diagnosis.weights
  const weights: Weights = {
    A: Math.max(5, base.A + gapBoost),
    T: Math.max(5, base.T + salienceBoost),
    E: Math.max(5, base.E),
    C: Math.max(5, base.C + captureBoost),
  }
  return { objective: diagnosis.createCapture, weights }
}

export function isBriefComplete(brief: BriefState): boolean {
  return Boolean(
    brief.clientName.trim() &&
      brief.campaignName.trim() &&
      brief.startDate &&
      brief.endDate &&
      brief.budget > 0 &&
      brief.objectiveKind
  )
}

export function isAudiencesComplete(audiences: AudienceDraft[]): boolean {
  if (audiences.length === 0) return false
  return audiences.every(
    (a) => a.segmentId && a.states.length > 0 && a.ageBands.length > 0 && a.name.trim()
  )
}

export function planningReducer(
  state: PlanningWorkflowState,
  action: PlanningAction
): PlanningWorkflowState {
  switch (action.type) {
    case "SET_STAGE":
      return { ...state, stage: action.stage }
    case "COMPLETE_STAGE":
      return {
        ...state,
        completed: { ...state.completed, [action.stage]: true },
      }
    case "SET_WAVE":
      return { ...state, waveId: action.waveId }
    case "PATCH_BRIEF":
      return { ...state, brief: { ...state.brief, ...action.patch } }
    case "SET_OBJECTIVE": {
      const preset = OBJECTIVE_PRESETS[action.kind]
      return {
        ...state,
        brief: { ...state.brief, objectiveKind: action.kind },
        diagnosis: {
          ...state.diagnosis,
          createCapture: preset.createCapture,
          weights: { ...preset.weights },
        },
      }
    }
    case "SET_ACTIVE_AUDIENCE":
      return { ...state, activeAudienceId: action.id }
    case "ADD_AUDIENCE": {
      if (state.audiences.length >= MAX_AUDIENCES) return state
      const used = new Set(state.audiences.map((a) => a.colorIndex))
      const colorIndex = ([0, 1, 2] as const).find((i) => !used.has(i)) ?? 0
      const segmentId = state.audiences[0]?.segmentId ?? ""
      const next = createAudienceDraft({ colorIndex, segmentId })
      return {
        ...state,
        audiences: [...state.audiences, next],
        activeAudienceId: next.id,
      }
    }
    case "REMOVE_AUDIENCE": {
      if (state.audiences.length <= 1) return state
      const audiences = state.audiences.filter((a) => a.id !== action.id)
      const activeAudienceId =
        state.activeAudienceId === action.id ? audiences[0]!.id : state.activeAudienceId
      return { ...state, audiences, activeAudienceId }
    }
    case "RENAME_AUDIENCE":
      return {
        ...state,
        audiences: state.audiences.map((a) =>
          a.id === action.id ? { ...a, name: action.name } : a
        ),
      }
    case "PATCH_AUDIENCE":
      return {
        ...state,
        audiences: state.audiences.map((a) =>
          a.id === action.id ? { ...a, ...action.patch, id: a.id, colorIndex: a.colorIndex } : a
        ),
      }
    case "PATCH_DIAGNOSIS":
      return { ...state, diagnosis: { ...state.diagnosis, ...action.patch } }
    case "TOGGLE_CHANNEL": {
      const has = state.excludedChannelIds.includes(action.engineChannelId)
      return {
        ...state,
        excludedChannelIds: has
          ? state.excludedChannelIds.filter((id) => id !== action.engineChannelId)
          : [...state.excludedChannelIds, action.engineChannelId],
      }
    }
    case "SET_EXCLUDED":
      return { ...state, excludedChannelIds: action.ids }
    case "RESET":
      return createInitialState({
        waveId: action.waveId,
        defaultSegmentId: action.defaultSegmentId,
      })
    default:
      return state
  }
}
