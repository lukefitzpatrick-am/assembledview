/**
 * FEATURE_WEB_SEARCH (on/1/true) is the global switch for the Web & search tab.
 * Off is 404 for clients (page and API). Admins see a notice on the page instead
 * of a 404 (lib/webReport/admin/pageMode.ts); the API stays 404 for every role.
 *
 * There is no per-client allowlist (FEATURE_WEB_SEARCH_CLIENTS is not read
 * since 2026-10-20). With the switch on, a client sees the tab only once their
 * report has been saved and published (lib/webReport/visibility.ts).
 */

const ON = new Set(["on", "1", "true"])

export function isWebSearchFlagOn(env: NodeJS.ProcessEnv = process.env): boolean {
  return ON.has((env.FEATURE_WEB_SEARCH ?? "").trim().toLowerCase())
}
