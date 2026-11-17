
export type SpendTreemapInput = {
  name: string
  value: number
  percentage?: number
}

/** Sparkline datum rows from a numeric series. */
export function reshapeSparkline(values: number[]) {
  return values.map((value, idx) => ({ idx, value }))
}
