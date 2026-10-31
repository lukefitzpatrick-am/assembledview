/**
 * Pure view model for the Change billing timing panel. No React, no fetch.
 */
import { toBillingOverrideLineItemId } from "@/lib/finance/manualBillingOverridesUi"

import type { MonthKey, RevisionOk } from "./types"

export type PanelTab = "bill_amount" | "pull_month" | "bill_remainder" | "underspend"

export const PANEL_TABS: Array<{ value: PanelTab; label: string }> = [
  { value: "bill_amount", label: "Bill ahead" },
  { value: "pull_month", label: "Pull a month" },
  { value: "bill_remainder", label: "Bill the remainder" },
  { value: "underspend", label: "Underspend" },
]

export type PanelForm = {
  tab: PanelTab
  intoMonth: MonthKey
  fromMonth: MonthKey | ""
  amount: string
  strategy: "earliest_first" | "proportional"
  underspendMonth: MonthKey | ""
  actuals: Record<string, string>
  noRemaining: Record<string, "last_month" | "credit">
  unlockApprovedMonths: MonthKey[]
  includeProduction: boolean
  feeFollows: boolean
  reason: string
}

export function initialPanelForm(args: {
  currentMonth: MonthKey
  tab?: PanelTab
  underspendMonth?: MonthKey | null
}): PanelForm {
  return {
    tab: args.tab ?? "bill_amount",
    intoMonth: args.currentMonth,
    fromMonth: "",
    amount: "",
    strategy: "earliest_first",
    underspendMonth: args.underspendMonth ?? "",
    actuals: {},
    noRemaining: {},
    unlockApprovedMonths: [],
    includeProduction: false,
    feeFollows: true,
    reason: "",
  }
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

export function monthShort(m: MonthKey): string {
  const [y, mm] = m.split("-")
  return `${MONTHS[Number(mm) - 1] ?? mm} ${y}`
}

const aud = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: 2 })

export function centsLabel(cents: number): string {
  return aud.format(cents / 100)
}

function parseDollars(v: string): number | null {
  const n = Number(String(v ?? "").replace(/[$,\s]/g, ""))
  return v.trim() !== "" && Number.isFinite(n) ? n : null
}

/** Why Preview is disabled, or null when it can run. */
export function previewBlocker(form: PanelForm): string | null {
  if (!form.reason.trim()) return "Add a reason."
  if (form.tab === "bill_amount") {
    const n = parseDollars(form.amount)
    if (n == null || n <= 0) return "Enter an amount above $0.00."
  }
  if (form.tab === "pull_month" && !form.fromMonth) return "Pick the month to pull from."
  if (form.tab === "underspend") {
    if (!form.underspendMonth) return "Pick the underspend month."
    const any = Object.values(form.actuals).some((v) => parseDollars(v) != null)
    if (!any) return "Type at least one actual."
  }
  return null
}

export function buildRequestBody(mbaNumber: string, form: PanelForm): Record<string, unknown> {
  const base = {
    mbaNumber,
    reason: form.reason.trim(),
    unlockApprovedMonths: form.unlockApprovedMonths,
    includeProduction: form.includeProduction,
    feeMode: form.feeFollows ? "follow" : "keep",
  }
  switch (form.tab) {
    case "bill_amount":
      return { ...base, mode: "bill_amount", intoMonth: form.intoMonth, amount: parseDollars(form.amount), strategy: form.strategy }
    case "bill_remainder":
      return { ...base, mode: "bill_remainder", intoMonth: form.intoMonth }
    case "pull_month":
      return { ...base, mode: "pull_month", intoMonth: form.intoMonth, fromMonth: form.fromMonth }
    case "underspend":
      return {
        ...base,
        mode: "underspend",
        underspendMonth: form.underspendMonth,
        actuals: Object.entries(form.actuals)
          .map(([lineItemId, v]) => ({ lineItemId, amount: parseDollars(v) }))
          .filter((a) => a.amount != null),
        noRemaining: Object.entries(form.noRemaining).map(([lineItemId, choice]) => ({ lineItemId, choice })),
      }
  }
}

export type GridCell = { before: number; after: number; changed: boolean }

export type PreviewGrid = {
  months: Array<{ month: MonthKey; label: string; locked: boolean; title: string }>
  rows: Array<{ lineItemId: string; label: string; skipped: string | null; cells: Record<MonthKey, GridCell> }>
  totals: Array<{ key: "media" | "fee" | "adserving" | "production" | "total"; label: string; cells: Record<MonthKey, GridCell> }>
}

const REASON_LABELS: Record<string, string> = {
  past_month: "past month",
  approved: "approved",
  sent_to_accounts: "sent to accounts",
  xero_matched: "in Xero",
  xero_outside_av: "invoiced outside AV",
  legacy_billed: "billed",
  aa_pack_sent: "in a sent AA pack",
  finance_period_locked: "finance period locked",
  after_campaign: "after the campaign",
}

export function lockTitle(reasons: string[], level: string): string {
  const parts = reasons.map((r) => REASON_LABELS[r] ?? r)
  if (level === "open" && parts.length === 0) return "Open"
  return parts.join(", ") || level
}

/**
 * Rows: lines that change, then skipped lines. Columns: months that have
 * any money or change. Cells: before and after.
 */
export function buildPreviewGrid(
  plan: Pick<RevisionOk, "lines" | "months">,
  baseLines: Array<{ lineItemId: string; media: Record<MonthKey, number> }>,
): PreviewGrid {
  const months = plan.months
    .filter((m) => m.total.before !== 0 || m.total.after !== 0)
    .map((m) => ({
      month: m.month,
      label: monthShort(m.month),
      locked: m.effectiveLevel !== "open" || m.lock.past,
      title: lockTitle(m.lock.reasons, m.effectiveLevel),
    }))
  const monthKeys = months.map((m) => m.month)
  // Keyed on the bare id (MB-11).
  const byId = new Map(baseLines.map((l) => [toBillingOverrideLineItemId(l.lineItemId), l]))
  const rows: PreviewGrid["rows"] = []
  for (const line of plan.lines) {
    const changed = line.media.length > 0 || line.fee.length > 0
    if (!changed && !line.skipped) continue
    const base = byId.get(toBillingOverrideLineItemId(line.lineItemId))?.media ?? {}
    const cells: Record<MonthKey, GridCell> = {}
    for (const m of monthKeys) {
      const d = line.media.find((c) => c.month === m)
      const before = d ? d.before : (base[m] ?? 0)
      const after = d ? d.after : before
      cells[m] = { before, after, changed: before !== after }
    }
    rows.push({ lineItemId: line.lineItemId, label: line.label, skipped: line.skipped ?? null, cells })
  }
  rows.sort((a, b) => Number(Boolean(a.skipped)) - Number(Boolean(b.skipped)))
  const totals: PreviewGrid["totals"] = (
    [
      ["media", "Media"],
      ["fee", "Fee"],
      ["adserving", "Ad serving"],
      ["production", "Production"],
      ["total", "Total"],
    ] as const
  ).map(([key, label]) => {
    const cells: Record<MonthKey, GridCell> = {}
    for (const m of plan.months) {
      if (!monthKeys.includes(m.month)) continue
      const c = m[key]
      cells[m.month] = { before: c.before, after: c.after, changed: c.before !== c.after }
    }
    return { key, label, cells }
  })
  return { months, rows, totals }
}

/** Current civil month in Australia/Sydney, for the browser (no node:crypto). */
export function sydneyMonthNow(now: Date = new Date()): MonthKey {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney", year: "numeric", month: "2-digit" }).formatToParts(now)
  return `${parts.find((p) => p.type === "year")?.value}-${parts.find((p) => p.type === "month")?.value}`
}

const HARD_STATES = new Set(["sent_to_finance", "legacy_billed", "drafted", "issued", "paid", "overdue", "issued_outside_av"])

/** Record underspend on a finance row: past or current month, not invoiced. */
export function underspendAction(record: {
  billing_month?: string | null
  state?: string | null
  billed?: boolean | null
}, now: Date = new Date()): { show: boolean; disabledReason?: string } {
  const month = String(record.billing_month ?? "").slice(0, 7)
  if (!/^\d{4}-\d{2}$/.test(month) || month > sydneyMonthNow(now)) return { show: false }
  if (HARD_STATES.has(String(record.state ?? "")) || record.billed === true) {
    return { show: true, disabledReason: "Invoiced. Underspend on invoiced months is not handled here." }
  }
  return { show: true }
}
