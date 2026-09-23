/**
 * After the nightly billing match: email a clearance report for each month
 * that has at least one sent-to-accounts row, when the set hash changed.
 */

import { loadClearanceMonths, lastClearanceHash, recordClearanceSend } from "@/lib/finance/loadClearance"
import { runClearanceReports } from "@/lib/finance/runClearanceReports"
import { sendAccountsPackEmail } from "@/lib/finance/sendAccountsPackMail"

export async function stageSendClearanceReports(): Promise<{
  sent: number
  unchanged: number
  failed: number
}> {
  const result = await runClearanceReports({
    force: false,
    deps: {
      accountsEmail: process.env.ACCOUNTS_NOTIFY_EMAIL,
      financeEmail: process.env.FINANCE_NOTIFY_EMAIL,
      loadMonths: loadClearanceMonths,
      lastHash: lastClearanceHash,
      sendEmail: sendAccountsPackEmail,
      recordSend: recordClearanceSend,
    },
  })
  return {
    sent: result.months.filter((month) => month.reason === "sent").length,
    unchanged: result.months.filter((month) => month.reason === "unchanged").length,
    failed: result.months.filter((month) => month.reason === "email_failed").length,
  }
}
