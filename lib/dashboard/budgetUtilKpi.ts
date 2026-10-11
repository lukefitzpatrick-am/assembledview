/** Shared with client dashboard `HeroKPIBar`. The number stays ink. Colour is the ring and the bar. */
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
      text: "text-foreground",
      ring: "stroke-pacing-ahead",
      fill: "bg-pacing-ahead",
      track: "bg-pacing-ahead-bg",
    }
  }

  if (utilized >= 25) {
    return {
      text: "text-foreground",
      ring: "stroke-pacing-behind",
      fill: "bg-pacing-behind",
      track: "bg-pacing-behind-bg",
    }
  }

  return {
    text: "text-foreground",
    ring: "stroke-pacing-critical",
    fill: "bg-pacing-critical",
    track: "bg-pacing-critical-bg",
  }
}
