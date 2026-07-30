import type { FinanceRunItem, RunCandidate } from "@/lib/finance/periods/types"
import { effectiveAmountCents } from "@/lib/finance/periods/reviewItem"

/**
 * After lock, non-admin edits to a locked item become a proposed variance in the
 * next open period, linked via linked_variance_from_item_id.
 */
export function buildVarianceCandidate(args: {
  lockedItem: FinanceRunItem
  proposedAmountCents: number
  reason: string
  nextPeriodInvoiceReference: string
}): RunCandidate & { linkedVarianceFromItemId: number; varianceReason: string } {
  const before = effectiveAmountCents(args.lockedItem)
  const delta = Math.round(args.proposedAmountCents) - before
  return {
    source: args.lockedItem.source,
    naturalKey: `variance:${args.lockedItem.naturalKey}:${args.lockedItem.id}`,
    mbaNumber: args.lockedItem.mbaNumber,
    clientId: args.lockedItem.clientId,
    versionId: args.lockedItem.versionId,
    sowId: args.lockedItem.sowId,
    lineItemsJson: {
      kind: "variance",
      fromItemId: args.lockedItem.id,
      beforeCents: before,
      proposedCents: Math.round(args.proposedAmountCents),
      deltaCents: delta,
      reason: args.reason,
    },
    amountCents: delta,
    invoiceReference: args.nextPeriodInvoiceReference,
    heldReason: null,
    linkedVarianceFromItemId: args.lockedItem.id,
    varianceReason: args.reason,
  }
}

/**
 * Admin override amend on a locked period item — returns before/after audit payload
 * and bumps sheet version label for a new archive (original never modified).
 */
export function buildAdminAmendAudit(args: {
  item: FinanceRunItem
  afterAmountCents: number
  reason: string
  currentSheetVersion: number
}): {
  beforeCents: number
  afterCents: number
  reason: string
  nextSheetVersion: number
  amendedAfterLock: true
} {
  const reason = String(args.reason ?? "").trim()
  if (!reason) throw new Error("Admin amend requires a mandatory reason")
  return {
    beforeCents: effectiveAmountCents(args.item),
    afterCents: Math.round(args.afterAmountCents),
    reason,
    nextSheetVersion: Math.max(2, (args.currentSheetVersion || 1) + 1),
    amendedAfterLock: true,
  }
}
