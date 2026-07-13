/**
 * Client-side robustness banding for unweighted_n (blueprint §10).
 * MoE approx at p=50%, 95% CI: ±98/√n pts (rounded).
 */
export type RobustnessBand = "bad" | "warn" | "ok"

export type RobustnessSignal = {
  band: RobustnessBand
  n: number
  /** e.g. "±12 pts" */
  moeLabel: string
  /** Short status copy */
  label: string
  /** Full helper line */
  detail: string
}

function moePts(n: number): number {
  if (!(n > 0)) return 99
  return Math.max(1, Math.round(98 / Math.sqrt(n)))
}

export function robustnessFromN(n: number): RobustnessSignal {
  const safeN = Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0
  const moe = moePts(safeN)
  const moeLabel = `±${moe} pts`

  if (safeN < 75) {
    return {
      band: "bad",
      n: safeN,
      moeLabel,
      label: "Thin base",
      detail: `${moeLabel} — treat directional only (n=${safeN})`,
    }
  }
  if (safeN < 200) {
    return {
      band: "warn",
      n: safeN,
      moeLabel,
      label: "Indicative",
      detail: `${moeLabel} — use with care (n=${safeN})`,
    }
  }
  return {
    band: "ok",
    n: safeN,
    moeLabel,
    label: "Robust",
    detail: `${moeLabel} — stable for planning (n=${safeN})`,
  }
}

/** Format audience_wc ('000s) for live panels. */
export function formatAudienceWc(wc: number): string {
  return wc.toLocaleString("en-AU", { maximumFractionDigits: 1 })
}

/** % of 14+ universe = audience_wc ÷ universe_wc (base/NAT). Never hardcode universe. */
export function pctOfUniverse(audienceWc: number, universeWc: number): number | null {
  if (!(universeWc > 0) || !Number.isFinite(audienceWc)) return null
  return (audienceWc / universeWc) * 100
}
