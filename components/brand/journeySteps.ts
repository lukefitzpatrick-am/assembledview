import { CAMPAIGN_PHASE } from "@/lib/design/status"

/** Keys of `CAMPAIGN_PHASE` in `lib/design/status.ts`. */
export type JourneyStatus = keyof typeof CAMPAIGN_PHASE

export const JOURNEY_STEPS = [
  { id: "planned", label: "Planned" },
  { id: "approved", label: "Approved" },
  { id: "booked", label: "Booked" },
  { id: "live", label: "Live" },
  { id: "completed", label: "Completed" },
] as const

export type JourneyStepId = (typeof JOURNEY_STEPS)[number]["id"]

export type JourneyStepState = "done-first" | "done" | "current" | "future"

export type JourneyModel =
  | { kind: "cancelled"; label: string }
  | {
      kind: "line"
      steps: Array<{ id: JourneyStepId; label: string; state: JourneyStepState }>
    }

/**
 * Done steps are forest-light, except the first done step (sky).
 * The matching status is current (lime). Later steps are future.
 * Cancelled replaces the line with one pill.
 */
export function journeyModel(status: JourneyStatus): JourneyModel {
  if (status === "cancelled") {
    return { kind: "cancelled", label: CAMPAIGN_PHASE.cancelled.label }
  }

  const current = JOURNEY_STEPS.findIndex((step) => step.id === status)
  return {
    kind: "line",
    steps: JOURNEY_STEPS.map((step, index) => {
      let state: JourneyStepState = "future"
      if (current >= 0 && index === current) state = "current"
      else if (current > 0 && index < current) state = index === 0 ? "done-first" : "done"
      return { id: step.id, label: step.label, state }
    }),
  }
}

/** The connector after a step is done when that step itself is done. */
export function journeyLineDone(state: JourneyStepState): boolean {
  return state === "done" || state === "done-first"
}
