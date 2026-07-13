/**
 * Demand-Flow Impact Index (DFII).
 * dfii = bcs / mean(bcs of included channels) × 100, rounded to whole numbers.
 * Mean 0 (or no included scores) → all null.
 */

export type DfiiChannelInput = {
  /** Behavioural channel score (0–100 scale from the BCS engine). */
  bcs: number | null | undefined
  /**
   * When false, the channel is omitted from the mean denominator
   * (e.g. Stage D exclusions) but still receives a DFII vs that mean.
   * Defaults to true.
   */
  includeInMean?: boolean
}

function finiteBcs(value: number | null | undefined): number | null {
  if (value == null) return null
  return Number.isFinite(value) ? value : null
}

/**
 * Returns one DFII per input channel (same order), or null when undefined.
 */
export function dfii(channels: DfiiChannelInput[]): (number | null)[] {
  const includedScores: number[] = []
  for (const ch of channels) {
    if (ch.includeInMean === false) continue
    const b = finiteBcs(ch.bcs)
    if (b != null) includedScores.push(b)
  }

  const mean =
    includedScores.length > 0
      ? includedScores.reduce((s, n) => s + n, 0) / includedScores.length
      : 0

  if (!(mean > 0)) {
    return channels.map(() => null)
  }

  return channels.map((ch) => {
    const b = finiteBcs(ch.bcs)
    if (b == null) return null
    return Math.round((b / mean) * 100)
  })
}

/** 100-reference colouring: >115 strong, 85–115 neutral, <85 weak. */
export type DfiiTone = "strong" | "neutral" | "weak"

export function dfiiTone(value: number | null | undefined): DfiiTone | null {
  if (value == null || !Number.isFinite(value)) return null
  if (value > 115) return "strong"
  if (value < 85) return "weak"
  return "neutral"
}

export function dfiiToneClass(tone: DfiiTone | null): string {
  if (tone === "strong") return "bg-pacing-ahead-bg text-status-ahead-fg"
  if (tone === "weak") return "bg-pacing-behind-bg text-status-behind-fg"
  if (tone === "neutral") return "bg-pacing-on-track-bg text-status-on-track-fg"
  return "text-muted-foreground"
}
