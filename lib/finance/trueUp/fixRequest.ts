/**
 * True-up fixes, pure pieces (design DESIGN-AV-true-up-2026-10-29, section 4).
 * Builds the `true_up` billing revision request from a report row, and the
 * ledger rows a confirmed fix writes. No DB, no clock.
 */

import type { RevisionOk, TrueUpRequest, TrueUpStrategy } from "@/lib/finance/revisions/types"

import { TRUE_UP_COMPONENTS, TRUE_UP_THRESHOLD_CENTS, type TrueUpComponent, type TrueUpMbaRow } from "./compute"

export type TrueUpFixChoice = {
  components: TrueUpComponent[]
  strategy: TrueUpStrategy
  /** No-invoice months finance chose to carry into the next open month (decision 2, mixed). */
  noInvoiceMonths?: string[]
}

export type TrueUpFixRequestResult = { ok: true; request: TrueUpRequest } | { ok: false; message: string }

/**
 * Months with at least one counted (sent and approved) invoice for the MBA
 * are set to what was invoiced. A month finance chose to carry is listed with
 * zeros. Months from the current month on are never touched.
 */
export function buildTrueUpFixRequest(args: {
  row: TrueUpMbaRow
  asOfMonth: string
  fromMonth: string
  currentMonth: string
  choice: TrueUpFixChoice
}): TrueUpFixRequestResult {
  const { row, choice } = args
  const components = [...new Set(choice.components)].filter((c) => TRUE_UP_COMPONENTS.includes(c))
  if (components.length === 0) return { ok: false, message: "Pick at least one of fee, ad serving, production or media." }
  if (choice.strategy !== "spread" && choice.strategy !== "carry") return { ok: false, message: "Spread or carry." }
  const carry = new Set(choice.noInvoiceMonths ?? [])
  const actuals: TrueUpRequest["actuals"] = {}
  for (const m of row.months) {
    if (m.month >= args.currentMonth || m.month > args.asOfMonth) continue
    const counted = m.invoiceNumbers.length > 0
    if (!counted && !carry.has(m.month)) continue
    if (carry.has(m.month) && counted) {
      return { ok: false, message: `${m.month} has an invoice. Only a month with no invoice can be carried.` }
    }
    const rec: Partial<Record<TrueUpComponent, number>> = {}
    for (const c of components) {
      const v = counted ? m.components[c].invoiced : 0
      if (v < 0) {
        return {
          ok: false,
          message: `${m.month}: credit notes take ${c} below zero. Record a credit note instead of a schedule fix.`,
        }
      }
      rec[c] = v
    }
    actuals[m.month] = rec
  }
  for (const m of carry) {
    if (!row.months.some((x) => x.month === m)) return { ok: false, message: `${m} is outside the true-up window.` }
    if (m >= args.currentMonth) return { ok: false, message: `${m} is not a past month.` }
  }
  if (Object.keys(actuals).length === 0) {
    return { ok: false, message: "No sent and approved invoices in the window, and no month chosen to carry." }
  }
  return {
    ok: true,
    request: {
      mode: "true_up",
      asOfMonth: args.asOfMonth,
      fromMonth: args.fromMonth,
      strategy: choice.strategy,
      components,
      actuals,
      ...(carry.size > 0 ? { noInvoiceMonths: [...carry].sort() } : {}),
    },
  }
}

/** Two requests describe the same fix (the apply's stale check). */
export function sameTrueUpActuals(a: TrueUpRequest, b: TrueUpRequest): boolean {
  const months = new Set([...Object.keys(a.actuals), ...Object.keys(b.actuals)])
  for (const m of months) {
    for (const c of new Set([...a.components, ...b.components])) {
      if ((a.actuals[m]?.[c] ?? null) !== (b.actuals[m]?.[c] ?? null)) return false
    }
  }
  return true
}

export type TrueUpLedgerDraft = {
  mbaNumber: string
  component: TrueUpComponent
  action: "schedule" | "one_off"
  strategy: TrueUpStrategy | null
  months: string[]
  asOfMonth: string
  gapCents: number
  amountCents: number
  note: string | null
}

/**
 * Ledger rows for a confirmed schedule fix: one `schedule` row per component,
 * plus a `one_off` row for what no open month could hold (decision 1: a
 * credit or charge to raise), when it is $1 or more.
 */
export function trueUpLedgerDrafts(args: { mbaNumber: string; request: TrueUpRequest; plan: RevisionOk }): TrueUpLedgerDraft[] {
  const out: TrueUpLedgerDraft[] = []
  const months = Object.keys(args.request.actuals).sort()
  for (const s of args.plan.trueUp?.components ?? []) {
    out.push({
      mbaNumber: args.mbaNumber,
      component: s.component,
      action: "schedule",
      strategy: args.request.strategy,
      months,
      asOfMonth: args.request.asOfMonth,
      gapCents: s.gapBefore,
      amountCents: s.residual,
      note: null,
    })
    if (Math.abs(s.residual) >= TRUE_UP_THRESHOLD_CENTS) {
      out.push({
        mbaNumber: args.mbaNumber,
        component: s.component,
        action: "one_off",
        strategy: null,
        months,
        asOfMonth: args.request.asOfMonth,
        gapCents: s.residual,
        amountCents: s.residual,
        note:
          s.residual > 0
            ? "Invoiced above what the schedule can hold. Raise a credit."
            : "No open month can take this. Raise a one-off charge.",
      })
    }
  }
  return out
}

/** The components a fix would offer by default: the ones that aren't matching or already covered. */
export function defaultFixComponents(row: TrueUpMbaRow): TrueUpComponent[] {
  return TRUE_UP_COMPONENTS.filter((c) => {
    const s = row.components[c].status
    return s === "gap" || s === "billed_ahead" || s === "ended" || s === "no_invoice"
  })
}
