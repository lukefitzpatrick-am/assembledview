/**
 * Month locks for billing revisions (design 3.2). Pure: callers load the
 * finance records, sent AA packs and finance periods, and pass `now`.
 *
 * Hard (never changes): exported_at set (incl. the 1970 xero: stamp),
 * matched Xero invoice, legacy billed, a xero: row for this MBA + month,
 * a locked finance period (only when FINANCE_PERIODS=on), after the
 * campaign end. AA pack months are hard for AA lines only.
 * Soft: approved_at set, exported_at null. Ticked open by the user.
 * Past: before the current Sydney month (a flag on the lock, not a level).
 */

import { addMonthKeys, defaultMonthLock, isMonthKey } from "./planBillingRevision"
import type { LockReason, MonthKey, MonthLock } from "./types"

export type LockFinanceRecord = {
  invoiceKey: string | null
  mbaNumber: string | null
  billingMonth: string | null
  approvedAt: string | null
  exportedAt: string | null
  matchedXeroInvoiceId: string | null
  billed: boolean | null
  billedAt: string | null
}

export type LockFinancePeriod = { month: string; status: string }

export type ResolveMonthLocksInput = {
  mbaNumber: string
  /** Months to lock, usually every month the plan or the request touches. */
  months: MonthKey[]
  records: LockFinanceRecord[]
  /** billing_month of each sent billing_partner_packs row that holds this MBA. */
  sentAaPackMonths: string[]
  periods: LockFinancePeriod[]
  /** isFinancePeriodsLockEnforced() — FINANCE_PERIODS=on. */
  financePeriodsLockEnforced: boolean
  lastCampaignMonth: MonthKey | null
  now: Date
}

export type ResolvedMonthLocks = {
  currentMonth: MonthKey
  locks: MonthLock[]
  aaLockedMonths: MonthKey[]
}

const LOCKED_PERIOD_STATUSES = new Set(["locked", "invoiced", "reconciled"])

function present(v: string | null | undefined): boolean {
  return v != null && String(v).trim().length > 0
}

/** "YYYY-MM" for many inputs: "2026-09", "2026-09-01", "September 2026". */
export function toMonthKey(raw: string | null | undefined): MonthKey | null {
  const s = String(raw ?? "").trim()
  if (!s) return null
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(s)) return s
  const d = s.slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(d) && isMonthKey(d.slice(0, 7))) return d.slice(0, 7)
  const m = s.match(
    /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})$/i,
  )
  if (m) {
    const idx =
      [
        "january",
        "february",
        "march",
        "april",
        "may",
        "june",
        "july",
        "august",
        "september",
        "october",
        "november",
        "december",
      ].indexOf(m[1]!.toLowerCase()) + 1
    return `${m[2]}-${String(idx).padStart(2, "0")}`
  }
  return null
}

/** Current civil month in Australia/Sydney (AEST/AEDT). */
export function currentSydneyMonth(now: Date): MonthKey {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Sydney",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now)
  const y = parts.find((p) => p.type === "year")?.value
  const m = parts.find((p) => p.type === "month")?.value
  return `${y}-${m}`
}

export function resolveMonthLocks(input: ResolveMonthLocksInput): ResolvedMonthLocks {
  const currentMonth = currentSydneyMonth(input.now)
  const mba = input.mbaNumber.trim().toLowerCase()
  const months = [...new Set(input.months.filter(isMonthKey))].sort()

  const reasonsByMonth = new Map<MonthKey, Set<LockReason>>()
  const add = (m: MonthKey, r: LockReason) => {
    const set = reasonsByMonth.get(m) ?? new Set<LockReason>()
    set.add(r)
    reasonsByMonth.set(m, set)
  }

  for (const rec of input.records) {
    const key = String(rec.invoiceKey ?? "").trim().toLowerCase()
    if (key.startsWith("xero:")) {
      if (String(rec.mbaNumber ?? "").trim().toLowerCase() !== mba) continue
      const m = toMonthKey(rec.billingMonth)
      if (m) add(m, "xero_outside_av")
      continue
    }
    const match = key.match(/^media:(.+):(\d{4}-\d{2})$/)
    if (!match || match[1] !== mba) continue
    const m = match[2]!
    if (present(rec.exportedAt)) add(m, "sent_to_accounts")
    if (present(rec.matchedXeroInvoiceId)) add(m, "xero_matched")
    if (rec.billed === true || present(rec.billedAt)) add(m, "legacy_billed")
    if (present(rec.approvedAt)) add(m, "approved")
  }

  if (input.financePeriodsLockEnforced) {
    for (const p of input.periods) {
      const m = toMonthKey(p.month)
      if (m && LOCKED_PERIOD_STATUSES.has(String(p.status).toLowerCase())) add(m, "finance_period_locked")
    }
  }

  const locks: MonthLock[] = months.map((month) => {
    const base = defaultMonthLock(month, currentMonth, input.lastCampaignMonth)
    const extra = reasonsByMonth.get(month)
    if (!extra || extra.size === 0) return base
    const reasons: LockReason[] = [...base.reasons, ...[...extra].sort()]
    const hardReasons = reasons.filter((r) => r !== "approved" && r !== "past_month")
    const level = hardReasons.length > 0 ? "hard" : extra.has("approved") ? "soft" : base.level
    return { month, level, reasons, past: base.past }
  })

  const packMonths = input.sentAaPackMonths.map(toMonthKey).filter((m): m is MonthKey => m != null)
  const lastPack = packMonths.sort().at(-1) ?? null
  const aaLockedMonths = lastPack ? months.filter((m) => m <= lastPack) : []

  return { currentMonth, locks, aaLockedMonths }
}

/** Every month from the earlier of (campaign start, current month) to the campaign end. */
export function revisionMonthSpan(args: {
  campaignStartMonth: MonthKey | null
  campaignEndMonth: MonthKey | null
  currentMonth: MonthKey
  cellMonths: MonthKey[]
}): MonthKey[] {
  const all = [...args.cellMonths.filter(isMonthKey)]
  if (args.campaignStartMonth) all.push(args.campaignStartMonth)
  if (args.campaignEndMonth) all.push(args.campaignEndMonth)
  all.push(args.currentMonth)
  all.sort()
  const out: MonthKey[] = []
  let m = all[0]!
  const end = all[all.length - 1]!
  while (m <= end && out.length < 600) {
    out.push(m)
    m = addMonthKeys(m, 1)
  }
  return out
}
