/**
 * Billed months at publish (decision S2 A): which months are invoiced, what a
 * new version changes in them, and the `keep` splice. Pure: no database, no
 * clock. The choice and the decision are in `./choice` (browser safe).
 *
 * A month is invoiced when a finance record says it was sent or billed:
 * exported to accounts, matched to a Xero invoice, legacy billed, a `xero:`
 * row for the MBA and month, or a closed finance period (FINANCE_PERIODS on).
 * Approved and not sent is not invoiced.
 *
 * `keep` copies the published tip's billing for those months as it is.
 * `credit` is not available until S11 bills negative lines.
 */
import type { BillingMonth } from "@/lib/billing/types"
import { parsePersistedBillingScheduleToMonths } from "@/lib/billing/parsePersistedBillingScheduleToMonths"
import { normalizeMonthKey } from "@/lib/finance/accrual"
import { toBillingOverrideLineItemId } from "@/lib/finance/manualBillingOverridesUi"
import { monthShort } from "@/lib/finance/revisions/panelModel"
import { monthLockReasons, type ResolveMonthLocksInput } from "@/lib/finance/revisions/resolveMonthLocks"
import type { LockReason, MonthKey } from "@/lib/finance/revisions/types"
import { explodeScheduleToMonthRows, type ScheduleMonthInsert } from "@/scripts/migration/_scheduleTransform"

import type { BilledMonth, BilledMonthLine, BilledMonthsCheck } from "./choice"

const INVOICED_REASONS: ReadonlySet<LockReason> = new Set<LockReason>([
  "sent_to_accounts",
  "xero_matched",
  "xero_outside_av",
  "legacy_billed",
  "finance_period_locked",
])

export type InvoicedMonth = { month: MonthKey; reasons: LockReason[] }

/** The invoiced months among month locks (a revision context already has them). */
export function invoicedMonthsFromLocks(
  locks: ReadonlyArray<{ month: MonthKey; reasons: Iterable<LockReason> }>,
): InvoicedMonth[] {
  const out: InvoicedMonth[] = []
  for (const { month, reasons: all } of locks) {
    const reasons = [...all].filter((r) => INVOICED_REASONS.has(r)).sort()
    if (reasons.length > 0) out.push({ month, reasons })
  }
  return out.sort((a, b) => a.month.localeCompare(b.month))
}

export function invoicedMonths(
  input: Pick<ResolveMonthLocksInput, "mbaNumber" | "records" | "periods" | "financePeriodsLockEnforced">,
): InvoicedMonth[] {
  return invoicedMonthsFromLocks([...monthLockReasons(input)].map(([month, reasons]) => ({ month, reasons })))
}

/** One billing cell. `month` is `YYYY-MM` or `YYYY-MM-01`. */
export type BillingCell = { lineItemId: string; component: string; month: string; amountCents: number }

function cellMap(cells: readonly BillingCell[], month: MonthKey): Map<string, number> {
  const out = new Map<string, number>()
  for (const c of cells) {
    if (String(c.month).slice(0, 7) !== month) continue
    const key = `${toBillingOverrideLineItemId(c.lineItemId)}|${c.component}`
    out.set(key, (out.get(key) ?? 0) + (Number(c.amountCents) || 0))
  }
  return out
}

/**
 * Per invoiced month: what the published tip bills (`base`) against what the
 * new version would bill (`candidate`). Line ids compare bare, so a
 * `billing-ooh::` decoration is not a change.
 */
export function checkBilledMonths(args: {
  invoiced: readonly InvoicedMonth[]
  base: readonly BillingCell[]
  candidate: readonly BillingCell[]
}): BilledMonthsCheck {
  const months = args.invoiced.map(({ month, reasons }) => {
    const before = cellMap(args.base, month)
    const after = cellMap(args.candidate, month)
    const lines: BilledMonthLine[] = []
    for (const key of [...new Set([...before.keys(), ...after.keys()])].sort()) {
      const baseCents = before.get(key) ?? 0
      const candidateCents = after.get(key) ?? 0
      if (baseCents === candidateCents) continue
      const [lineItemId, component] = key.split("|") as [string, string]
      lines.push({ lineItemId, component, baseCents, candidateCents })
    }
    const sum = (m: Map<string, number>) => [...m.values()].reduce((s, v) => s + v, 0)
    const baseCents = sum(before)
    const candidateCents = sum(after)
    return {
      month,
      reasons,
      baseCents,
      candidateCents,
      deltaCents: candidateCents - baseCents,
      changed: lines.length > 0,
      lines,
    }
  })
  return { months, changedMonths: months.filter((m) => m.changed).map((m) => m.month) }
}

function monthKeyOf(entry: BillingMonth): MonthKey | null {
  return normalizeMonthKey(String(entry.monthYear ?? "").trim()) || null
}

function explodeCells(schedule: unknown): BillingCell[] | null {
  const out = explodeScheduleToMonthRows(0, "billing", schedule)
  return out.failureReason ? null : out.rows
}

/** Billing cells a schedule blob bills, or null when it cannot be read. */
export function billingCellsOf(schedule: unknown): BillingCell[] | null {
  return explodeCells(schedule)
}

function sameCells(a: readonly BillingCell[], b: readonly BillingCell[], months: readonly MonthKey[]): boolean {
  return months.every((m) => {
    const x = cellMap(a, m)
    const y = cellMap(b, m)
    return [...new Set([...x.keys(), ...y.keys()])].every((k) => (x.get(k) ?? 0) === (y.get(k) ?? 0))
  })
}

export type SpliceResult =
  | { ok: true; schedule: BillingMonth[]; rows: ScheduleMonthInsert[] }
  | { ok: false; message: string }

/**
 * `keep`: the kept months take the published tip's blob month entries and
 * its stored billing rows exactly; every other month stays the new
 * version's. Delivery rows are untouched. Refuses (nothing to write) unless
 * the rebuilt blob bills the tip's cells in the kept months and the new
 * version's cells in the rest.
 */
export function spliceBilledMonths(args: {
  months: readonly MonthKey[]
  candidateSchedule: BillingMonth[]
  candidateRows: readonly ScheduleMonthInsert[]
  baseSchedule: unknown
  baseRows: readonly BillingCell[]
  versionId: number
}): SpliceResult {
  const kept = new Set(args.months)
  const baseMonths = (() => {
    try {
      return parsePersistedBillingScheduleToMonths(args.baseSchedule) ?? []
    } catch {
      return null
    }
  })()
  const fail = (): SpliceResult => ({
    ok: false,
    message: `The billed rows for ${args.months.map(monthShort).join(", ")} could not be copied exactly from the published version. Nothing was saved.`,
  })
  if (baseMonths == null) return fail()

  const isKept = (e: BillingMonth) => {
    const k = monthKeyOf(e)
    return k != null && kept.has(k)
  }
  const schedule = [...args.candidateSchedule.filter((e) => !isKept(e)), ...baseMonths.filter(isKept)].sort((a, b) =>
    (monthKeyOf(a) ?? "").localeCompare(monthKeyOf(b) ?? ""),
  )

  const rows: ScheduleMonthInsert[] = [
    ...args.candidateRows.filter((r) => r.basis !== "billing" || !kept.has(String(r.month).slice(0, 7))),
    ...args.baseRows
      .filter((r) => kept.has(String(r.month).slice(0, 7)))
      .map((r) => ({
        versionId: args.versionId,
        lineItemId: r.lineItemId,
        component: r.component as ScheduleMonthInsert["component"],
        basis: "billing" as const,
        month: `${String(r.month).slice(0, 7)}-01`,
        amountCents: Number(r.amountCents) || 0,
        source: ((r as { source?: string }).source === "override" ? "override" : "computed") as ScheduleMonthInsert["source"],
      })),
  ]

  const spliced = explodeCells(schedule)
  const base = explodeCells(args.baseSchedule)
  const candidate = explodeCells(args.candidateSchedule)
  if (!spliced || !base || !candidate) return fail()
  const allMonths = [...new Set([...spliced, ...candidate].map((c) => String(c.month).slice(0, 7)))]
  const otherMonths = allMonths.filter((m) => !kept.has(m))
  if (!sameCells(spliced, base, args.months) || !sameCells(spliced, candidate, otherMonths)) return fail()
  return { ok: true, schedule, rows }
}
