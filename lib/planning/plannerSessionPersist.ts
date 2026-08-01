/**
 * Session persistence for the Demand Flow (behavioural) planner five-stage workflow.
 * Versioned key — bump the suffix when the snapshot shape changes incompatibly.
 */

import type { PlanningWorkflowState } from "@/components/planning/store"

export const PLANNER_SESSION_STORAGE_KEY = "av:behavioural-planner:session:v1"

export type PlannerSessionSnapshot = {
  v: 1
  savedAt: string
  state: PlanningWorkflowState
  insightByKey: Record<string, string>
}

export function serializePlannerSession(
  state: PlanningWorkflowState,
  insightByKey: Record<string, string> = {}
): string {
  const snap: PlannerSessionSnapshot = {
    v: 1,
    savedAt: new Date().toISOString(),
    state,
    insightByKey,
  }
  return JSON.stringify(snap)
}

export function parsePlannerSession(raw: string | null): PlannerSessionSnapshot | null {
  if (!raw?.trim()) return null
  try {
    const parsed = JSON.parse(raw) as PlannerSessionSnapshot
    if (parsed?.v !== 1 || !parsed.state || !Array.isArray(parsed.state.audiences)) {
      return null
    }
    if (parsed.state.audiences.length === 0) return null
    return {
      v: 1,
      savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : new Date().toISOString(),
      state: parsed.state,
      insightByKey:
        parsed.insightByKey && typeof parsed.insightByKey === "object"
          ? parsed.insightByKey
          : {},
    }
  } catch {
    return null
  }
}

export function writePlannerSession(
  state: PlanningWorkflowState,
  insightByKey: Record<string, string> = {}
): void {
  if (typeof window === "undefined") return
  try {
    window.sessionStorage.setItem(
      PLANNER_SESSION_STORAGE_KEY,
      serializePlannerSession(state, insightByKey)
    )
  } catch {
    // quota / private mode
  }
}

export function readPlannerSession(): PlannerSessionSnapshot | null {
  if (typeof window === "undefined") return null
  try {
    return parsePlannerSession(window.sessionStorage.getItem(PLANNER_SESSION_STORAGE_KEY))
  } catch {
    return null
  }
}

export function clearPlannerSession(): void {
  if (typeof window === "undefined") return
  try {
    window.sessionStorage.removeItem(PLANNER_SESSION_STORAGE_KEY)
  } catch {
    // ignore
  }
}
