import type { FinanceRunItem, ReviewAction } from "@/lib/finance/periods/types"

export function applyReviewAction(
  item: FinanceRunItem,
  action: ReviewAction
): FinanceRunItem {
  switch (action.type) {
    case "approve":
      return {
        ...item,
        status: "approved",
        holdReason: null,
        excludeReason: null,
      }
    case "adjust": {
      const reason = String(action.reason ?? "").trim()
      if (!reason) throw new Error("Adjust requires a reason")
      return {
        ...item,
        status: "adjusted",
        adjustmentCents: Math.round(action.adjustmentCents),
        adjustmentReason: reason,
        holdReason: null,
        excludeReason: null,
      }
    }
    case "hold": {
      const reason = String(action.reason ?? "").trim()
      if (!reason) throw new Error("Hold requires a reason")
      return {
        ...item,
        status: "held",
        holdReason: reason,
        excludeReason: null,
      }
    }
    case "exclude": {
      const reason = String(action.reason ?? "").trim()
      if (!reason) throw new Error("Exclude requires a reason")
      return {
        ...item,
        status: "excluded",
        excludeReason: reason,
        holdReason: null,
      }
    }
    default:
      throw new Error("Unknown review action")
  }
}

/** Effective billed cents (base + optional adjustment). */
export function effectiveAmountCents(item: FinanceRunItem): number {
  if (item.status === "excluded") return 0
  if (item.status === "adjusted" && item.adjustmentCents != null) {
    return item.amountCents + item.adjustmentCents
  }
  return item.amountCents
}
