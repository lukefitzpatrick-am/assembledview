export type AvaPacingNudgeKind = "over" | "under"

export type AvaPacingNudgeResult = {
  kind: AvaPacingNudgeKind
  copy: string
}

/** v1 thresholds — tune later. Matches hero KPI pacePct (actual / expected × 100). */
export function resolveAvaPacingNudge(pacePct: number): AvaPacingNudgeResult | null {
  if (!Number.isFinite(pacePct)) return null
  if (pacePct > 115) {
    return {
      kind: "over",
      copy: "Over-pacing — burning budget faster than planned.",
    }
  }
  if (pacePct < 85) {
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
