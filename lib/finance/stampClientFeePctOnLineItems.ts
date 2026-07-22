/**
 * Stamp container-level agency fee from FeeLoading (clients-table per media type)
 * onto line items before persist / fee reconciliation.
 *
 * Container publish can leave feePct at 0 when client fee state was still null
 * (create page never set feeinfluencers; feeintegration column often absent).
 * Billing already uses FeeLoading — save must use the same lookup.
 */

import { resolveFeePctFromFeeLoading } from "@/lib/finance/computeCampaignFinancials"
import type { FeeLoading } from "@/lib/finance/campaignFinancials.types"

export function stampClientFeePctOnLineItems<T extends Record<string, unknown>>(
  lineItems: ReadonlyArray<T> | null | undefined,
  mediaType: string,
  feeLoading: FeeLoading
): Array<T & { feePct: number }> {
  const feePct = resolveFeePctFromFeeLoading(mediaType, feeLoading)
  return (lineItems ?? []).map((li) => ({ ...li, feePct }))
}
