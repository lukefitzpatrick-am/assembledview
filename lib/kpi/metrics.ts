/** Parse user percent input: accept decimals (0.08) or whole percent (8 → 0.08). */
export function parsePercentHeuristic(raw: string): number {
  const val = parseFloat(raw.replace(/[^0-9.-]/g, "")) || 0
  return val > 1 ? val / 100 : val
}

export function formatPercentForInput(decimal: number): string {
  return `${(decimal * 100).toFixed(2)}%`
}
