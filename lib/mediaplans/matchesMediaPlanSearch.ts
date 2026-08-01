/**
 * Fail-closed search match for the media plans list.
 * Every field is coerced via `String(x ?? "")` so a malformed/corrupted API row
 * (e.g. mba_number as number after numeric coercion) cannot throw and take down the page.
 */
export function matchesMediaPlanSearch(
  plan: {
    mp_client_name?: string | null
    campaign_name?: string | null
    mba_number?: string | null
    brand?: string | null
  },
  searchTerm: string,
): boolean {
  const q = String(searchTerm ?? "").toLowerCase()
  if (!q) return true
  return (
    String(plan.mp_client_name ?? "").toLowerCase().includes(q) ||
    String(plan.campaign_name ?? "").toLowerCase().includes(q) ||
    String(plan.mba_number ?? "").toLowerCase().includes(q) ||
    String(plan.brand ?? "").toLowerCase().includes(q)
  )
}
