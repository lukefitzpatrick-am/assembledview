/**
 * Fail-closed search match for the media plans list.
 * Every string field is coerced via `(x ?? "")` so a malformed API row cannot
 * throw and take down the page.
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
  const q = (searchTerm ?? "").toLowerCase()
  if (!q) return true
  return (
    (plan.mp_client_name ?? "").toLowerCase().includes(q) ||
    (plan.campaign_name ?? "").toLowerCase().includes(q) ||
    (plan.mba_number ?? "").toLowerCase().includes(q) ||
    (plan.brand ?? "").toLowerCase().includes(q)
  )
}
