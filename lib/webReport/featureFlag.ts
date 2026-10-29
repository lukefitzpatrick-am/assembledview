/**
 * The web_search switch (lib/features/registry.ts; env FEATURE_WEB_SEARCH
 * on/1/true until a switch row exists) is the global switch for the Web & search tab.
 * Off is 404 for clients (page and API). Admins never get a 404 because of the
 * switch: the page shows a notice (lib/webReport/admin/pageMode.ts) and the API
 * answers as it does with the switch on (Luke, 29 Oct 2026).
 *
 * There is no per-client allowlist (FEATURE_WEB_SEARCH_CLIENTS is not read
 * since 2026-10-20). With the switch on, a client sees the tab only once their
 * report has been saved and published (lib/webReport/visibility.ts).
 */

import "server-only"

import { isFeatureOn } from "@/lib/features/server"

export async function isWebSearchFlagOn(env: Record<string, string | undefined> = process.env): Promise<boolean> {
  return isFeatureOn("web_search", env)
}

/**
 * True when FEATURE_WEB_SEARCH alone should turn this request away (404).
 * Only clients: admins see the page and API whatever the switch says.
 */
export function webSearchFlagBlocks(input: { isAdmin: boolean; flagOn: boolean }): boolean {
  return !input.flagOn && !input.isAdmin
}
