/**
 * Email a clearance report per sent month. Nightly sends only when the
 * (invoice id, state, amount) hash changed. Clear for issue forces a send
 * and writes the audit row after the email succeeds.
 */

import {
  AccountsNotifyUnsetError,
  AccountsPackEmailError,
} from "@/lib/finance/sendToAccounts"
import {
  buildClearanceReport,
  clearanceBody,
  clearanceClearedCsv,
  clearanceSubject,
  shouldSendClearance,
  type ClearanceCounts,
  type ClearanceReport,
  type ClearanceSourceRow,
} from "@/lib/finance/clearanceReport"

export type ClearanceMonthLoad = {
  month: string
  rows: ClearanceSourceRow[]
}

export type ClearanceSendRecord = {
  month: string
  hash: string
  counts: ClearanceCounts
}

export type RunClearanceDeps = {
  accountsEmail: string | null | undefined
  financeEmail?: string | null
  loadMonths: () => Promise<ClearanceMonthLoad[]>
  lastHash: (month: string) => Promise<string | null>
  sendEmail: (input: {
    to: string
    cc?: string
    subject: string
    text: string
    attachments: { filename: string; contentType: string; bytes: Buffer }[]
  }) => Promise<void>
  recordSend: (row: ClearanceSendRecord) => Promise<void>
  /** Set by Clear for issue. Called only after the email and the hash row succeed. */
  audit?: (report: ClearanceReport) => Promise<void>
}

export type ClearanceMonthOutcome = {
  month: string
  sent: boolean
  reason: "sent" | "unchanged" | "empty" | "email_failed"
  hash?: string
}

export async function runClearanceReports(input: {
  force: boolean
  months?: string[]
  deps: RunClearanceDeps
}): Promise<{ months: ClearanceMonthOutcome[] }> {
  const to = input.deps.accountsEmail?.trim() ?? ""
  if (!to) {
    if (input.force) throw new AccountsNotifyUnsetError()
    return { months: [] }
  }

  const loaded = await input.deps.loadMonths()
  const wanted = input.months ? new Set(input.months) : null
  const months = loaded.filter((month) => (wanted ? wanted.has(month.month) : true))
  const outcomes: ClearanceMonthOutcome[] = []

  for (const month of months) {
    const report = buildClearanceReport(month.month, month.rows)
    if (report.entries.length === 0) {
      outcomes.push({ month: month.month, sent: false, reason: "empty" })
      continue
    }
    const previous = await input.deps.lastHash(month.month)
    if (!shouldSendClearance(previous, report.hash, input.force)) {
      outcomes.push({ month: month.month, sent: false, reason: "unchanged", hash: report.hash })
      continue
    }
    const cc = input.deps.financeEmail?.trim() || undefined
    try {
      await input.deps.sendEmail({
        to,
        cc,
        subject: clearanceSubject(report),
        text: clearanceBody(report),
        attachments: [
          {
            filename: `${month.month}-cleared.csv`,
            contentType: "text/csv",
            bytes: Buffer.from(clearanceClearedCsv(report), "utf8"),
          },
        ],
      })
    } catch (error) {
      if (input.force) throw new AccountsPackEmailError(error)
      outcomes.push({ month: month.month, sent: false, reason: "email_failed", hash: report.hash })
      continue
    }
    await input.deps.recordSend({
      month: month.month,
      hash: report.hash,
      counts: report.counts,
    })
    if (input.deps.audit) await input.deps.audit(report)
    outcomes.push({ month: month.month, sent: true, reason: "sent", hash: report.hash })
  }

  return { months: outcomes }
}
