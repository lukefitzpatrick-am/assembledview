/**
 * Live Partial MBA selection for POST /api/mba/generate.
 * Overlay keys only — never client money totals, never writes approved_slice.
 *
 * Full MBA (`isPartialMBA === false`) must return null so generate stays on the
 * frozen slice: a non-null overlay sets liveOverlay, re-sums totals from
 * schedule rows, and drops the resolved.billing fallback. Checked first so a
 * full MBA never depends on hydration.
 */

import type { LiveMbaSelection } from "@/lib/docs/mbaRenderFilters"

export type LiveMbaScopeLine = {
  approval?: string | null
  lineItemId?: string | null
}

export function deriveLiveMbaScopeSelection(args: {
  isPartialMBA: boolean
  allChannelsHydrated: boolean
  lineItems: ReadonlyArray<LiveMbaScopeLine>
  selectedMonthYears: readonly string[]
}): LiveMbaSelection | null {
  if (!args.isPartialMBA) return null
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
