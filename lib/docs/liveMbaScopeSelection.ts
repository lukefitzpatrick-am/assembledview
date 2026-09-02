/**
 * Live Partial MBA selection for POST /api/mba/generate.
 * Overlay keys only — never client money totals, never writes approved_slice.
 */

import type { LiveMbaSelection } from "@/lib/docs/mbaRenderFilters"

export type LiveMbaScopeLine = {
  approval?: string | null
  lineItemId?: string | null
}

export function deriveLiveMbaScopeSelection(args: {
  allChannelsHydrated: boolean
  lineItems: ReadonlyArray<LiveMbaScopeLine>
  selectedMonthYears: readonly string[]
}): LiveMbaSelection | null {
  if (!args.allChannelsHydrated) return null
  const ids = args.lineItems
    .filter((l) => l.approval !== "excluded")
    .map((l) => l.lineItemId)
    .filter((id): id is string => Boolean(id))
  if (ids.length === 0) return null
  return {
    approvedLineItemIds: ids,
    ...(args.selectedMonthYears.length > 0
      ? { selectedMonthYears: [...args.selectedMonthYears] }
      : {}),
  }
}
