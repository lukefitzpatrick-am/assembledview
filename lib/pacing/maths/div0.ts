/** Snowflake DIV0: 0 when denominator is 0, NaN, or null/undefined. */
export function div0(numerator: number, denominator: number): number {
  if (denominator == null || denominator === 0 || Number.isNaN(denominator)) {
    return 0
  }
  return numerator / denominator
}
