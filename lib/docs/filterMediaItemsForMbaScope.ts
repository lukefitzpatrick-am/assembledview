/**
 * Drop Excel rows whose line is outside the version MBA scope.
 * Shared by persist regenerate, draft render, and the live twin workbooks.
 * `lineItemIds` null = full line scope (no filter). Empty array = none.
 */

import {
  buildCanonicalBillingLineIdSet,
  canonicalBillingLineIdSetHas,
} from "@/lib/finance/manualBillingOverridesUi"
import type { MediaItems } from "@/lib/generateMediaPlan"

export function filterMediaItemsForMbaScope(
  mediaItems: MediaItems,
  scope: { lineItemIds: string[] | null } | null | undefined,
): MediaItems {
  if (scope == null || scope.lineItemIds == null) return mediaItems
  const allowed = buildCanonicalBillingLineIdSet(scope.lineItemIds)
  const next = { ...mediaItems }
  for (const key of Object.keys(mediaItems) as (keyof MediaItems)[]) {
    next[key] = mediaItems[key].filter((item) =>
      canonicalBillingLineIdSetHas(
        allowed,
        String(item.line_item_id ?? item.lineItemId ?? ""),
      ),
    )
  }
  return next
}
