import type { ConfirmOptions } from "@/hooks/use-confirm"
import { formatMoney } from "@/lib/format/money"

/**
 * The question both plan pages ask before saving a campaign that is over
 * budget (B57). Yes saves, no stops the save before anything runs. Each page
 * keeps its own place for the question in `handleSaveAll`.
 */
export function overBudgetQuestion(budgetRemaining: number): ConfirmOptions {
  return {
    title: "Save over budget?",
    description: `Budget remaining is ${formatMoney(budgetRemaining)}. This campaign is over budget.`,
    confirmLabel: "Save anyway",
  }
}
