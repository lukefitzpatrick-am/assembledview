/**
 * Fail-closed search match for the media plans list.
 * Every field is coerced via `String(x ?? "")` so a malformed/corrupted API row
 * (e.g. mba_number as number after numeric coercion) cannot throw and take down the page.
 * Matching uses the shared `matchText` primitive (token-prefix AND, diacritic-insensitive).
 */
import { matchTextAny } from "@/lib/search/matchText"

export function matchesMediaPlanSearch(
  plan: {
    mp_client_name?: string | null
    campaign_name?: string | null
    mba_number?: string | null
    brand?: string | null
  },
  searchTerm: string,
): boolean {
  return matchTextAny(
    [plan.mp_client_name, plan.campaign_name, plan.mba_number, plan.brand],
    searchTerm,
  )
}
