/** Shared with client dashboard `HeroKPIBar` — utilization % → KPI accent (ring, bar, label). */
export function clampBudgetUtilizationPct(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value))
}

export function getBudgetUtilizationKpiTone(utilized: number): {
  text: string
  ring: string
  fill: string
  track: string
} {
  if (utilized > 50) {
    return {
      text: "text-emerald-600 dark:text-emerald-400",
      ring: "stroke-emerald-600 dark:stroke-emerald-400",
      fill: "bg-emerald-600 dark:bg-emerald-500",
      track: "bg-emerald-100/70 dark:bg-emerald-950/40",
    }
  }

  if (utilized >= 25) {
    return {
      text: "text-amber-600 dark:text-amber-400",
      ring: "stroke-amber-600 dark:stroke-amber-400",
      fill: "bg-amber-600 dark:bg-amber-500",
      track: "bg-amber-100/70 dark:bg-amber-950/40",
    }
  }

  return {
    text: "text-rose-600 dark:text-rose-400",
    ring: "stroke-rose-600 dark:stroke-rose-400",
    fill: "bg-rose-600 dark:bg-rose-500",
    track: "bg-rose-100/70 dark:bg-rose-950/40",
  }
}
