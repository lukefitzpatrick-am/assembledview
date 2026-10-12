import { PACING_STATUS_THRESHOLDS } from "@/lib/pacing/status"

export type AvaPacingNudgeKind = "over" | "under"

export type AvaPacingNudgeResult = {
  kind: AvaPacingNudgeKind
  copy: string
}

/** Hero pace is actual ÷ expected × 100. Bands are `PACING_STATUS_THRESHOLDS`. */
export function resolveAvaPacingNudge(pacePct: number): AvaPacingNudgeResult | null {
  if (!Number.isFinite(pacePct)) return null
  const t = PACING_STATUS_THRESHOLDS
  if (pacePct >= t.overPacingFromPct) {
    return {
      kind: "over",
      copy: "Over-pacing — burning budget faster than planned.",
    }
  }
  if (pacePct < t.behindBelowPct) {
    return {
      kind: "under",
      copy: "Under-delivering vs plan to date.",
    }
  }
  return null
}

export function buildAvaPacingNudgeMessage(pacePct: number): string {
  const pct = Math.round(pacePct)
  return `Delivery is pacing at ${pct}% vs plan for this campaign — explain why and what to do, grounded in get_delivery_snapshot / get_pacing_snapshot.`
}
