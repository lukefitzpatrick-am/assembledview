/** Snowflake has not had V_CREATIVE_PERFORMANCE_DAILY created yet. */
export function isMissingCreativePerformanceView(err: unknown): boolean {
  const parts: string[] = []
  let current: unknown = err
  for (let depth = 0; depth < 4 && current; depth++) {
    if (typeof current === "object" && current && "message" in current) {
      parts.push(String((current as { message: unknown }).message))
    } else {
      parts.push(String(current))
    }
    current =
      typeof current === "object" && current && "cause" in current
        ? (current as { cause: unknown }).cause
        : null
  }
  const message = parts.join(" ")
  return (
    /v_creative_performance_daily/i.test(message) &&
    /does not exist|not authorized/i.test(message)
  )
}
