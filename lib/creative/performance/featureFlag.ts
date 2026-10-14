/**
 * Creative performance is off unless the global switch is on/1/true and the
 * dashboard slug is in FEATURE_CREATIVE_PERFORMANCE_CLIENTS (comma-separated).
 * Off is 404 for every role, including admin.
 */

const ON = new Set(["on", "1", "true"])

export function isCreativePerformanceEnabled(
  slug: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const flag = (env.FEATURE_CREATIVE_PERFORMANCE ?? "").trim().toLowerCase()
  if (!ON.has(flag)) return false
  const allow = (env.FEATURE_CREATIVE_PERFORMANCE_CLIENTS ?? "")
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
  return allow.includes(slug.trim().toLowerCase())
}
