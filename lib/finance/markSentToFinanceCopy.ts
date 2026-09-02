export const MARK_SENT_TO_FINANCE_TITLE = "Mark as sent to finance?"

export const MARK_SENT_TO_FINANCE_COPY =
  "This marks the approved invoices in the current scope as sent to finance. Those months become read-only until they are un-marked. Downloading the workbook does not mark them sent."

export const MARK_SENT_TO_FINANCE_CONFIRM = "Mark as sent to finance"

export function markSentResultToast(input: {
  marked: number
  skippedNotApproved: number
}): string {
  if (input.skippedNotApproved > 0) {
    return `${input.marked} marked, ${input.skippedNotApproved} skipped (not approved)`
  }
  return `Marked ${input.marked} invoice${input.marked === 1 ? "" : "s"} as sent to finance`
}
