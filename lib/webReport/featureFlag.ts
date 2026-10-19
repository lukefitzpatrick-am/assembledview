/**
 * Web & search is off unless FEATURE_WEB_SEARCH is on/1/true and the
 * dashboard slug is in FEATURE_WEB_SEARCH_CLIENTS (comma-separated).
 * Off is 404 for every role, including admin.
 */

const ON = new Set(["on", "1", "true"])

/** Slugs named in FEATURE_WEB_SEARCH_CLIENTS. Does not read FEATURE_WEB_SEARCH. */
export function webSearchClientAllowlist(env: NodeJS.ProcessEnv = process.env): Set<string> {
  return new Set(
    (env.FEATURE_WEB_SEARCH_CLIENTS ?? "")
      .split(",")
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean),
  )
}

export function isWebSearchEnabled(slug: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const flag = (env.FEATURE_WEB_SEARCH ?? "").trim().toLowerCase()
  if (!ON.has(flag)) return false
  return webSearchClientAllowlist(env).has(slug.trim().toLowerCase())
}
