/**
 * Creative performance is on for every client dashboard when the global
 * switch FEATURE_CREATIVE_PERFORMANCE is on/1/true. Off (or unset) is 404 for
 * every role, including admin. FEATURE_CREATIVE_PERFORMANCE_CLIENTS is no
 * longer read (it was a per-client allowlist until 2026-10-20).
 */

const ON = new Set(["on", "1", "true"])

export function isCreativePerformanceEnabled(
  _slug: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const flag = (env.FEATURE_CREATIVE_PERFORMANCE ?? "").trim().toLowerCase()
  return ON.has(flag)
}
