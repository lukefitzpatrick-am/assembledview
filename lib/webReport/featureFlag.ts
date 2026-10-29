/**
 * FEATURE_WEB_SEARCH (on/1/true) is the global switch for the Web & search tab.
 * Off is 404 for clients (page and API). Admins never get a 404 because of the
 * switch: the page shows a notice (lib/webReport/admin/pageMode.ts) and the API
 * answers as it does with the switch on (Luke, 29 Oct 2026).
 *
 * There is no per-client allowlist (FEATURE_WEB_SEARCH_CLIENTS is not read
 * since 2026-10-20). With the switch on, a client sees the tab only once their
 * report has been saved and published (lib/webReport/visibility.ts).
 */

const ON = new Set(["on", "1", "true"])

export function isWebSearchFlagOn(env: NodeJS.ProcessEnv = process.env): boolean {
  return ON.has((env.FEATURE_WEB_SEARCH ?? "").trim().toLowerCase())
}

/**
 * True when FEATURE_WEB_SEARCH alone should turn this request away (404).
 * Only clients: admins see the page and API whatever the switch says.
 */
export function webSearchFlagBlocks(input: { isAdmin: boolean; flagOn: boolean }): boolean {
  return !input.flagOn && !input.isAdmin
}
