/**
 * True-up fix panel model (pure, client-safe): the choices a row offers, the
 * preview grid and the ledger labels.
 */

import type { RevisionOk } from "@/lib/finance/revisions/types"

import {
  TRUE_UP_COMPONENTS,
  TRUE_UP_COMPONENT_LABELS,
  type TrueUpActionRef,
  type TrueUpComponent,
  type TrueUpMbaRow,
} from "./compute"

/** Past months in the window with nothing invoiced but something scheduled: the carry candidates (decision 2). */
export function noInvoiceMonthOptions(row: TrueUpMbaRow, currentMonth: string): string[] {
  return row.months
    .filter((m) => m.month < currentMonth && m.invoiceNumbers.length === 0)
    .filter((m) => TRUE_UP_COMPONENTS.some((c) => m.components[c].scheduled !== 0))
    .map((m) => m.month)
}

export type PreviewGridRow = {
  month: string
  cells: Array<{ component: TrueUpComponent; before: number; after: number }>
}

/** Months whose schedule changes, with before and after per component. */
export function trueUpPreviewGrid(plan: Pick<RevisionOk, "months">): PreviewGridRow[] {
  const out: PreviewGridRow[] = []
  for (const m of plan.months) {
    const cells = TRUE_UP_COMPONENTS.map((c) => ({ component: c, before: m[c].before, after: m[c].after }))
    if (cells.every((x) => x.before === x.after)) continue
    out.push({ month: m.month, cells })
  }
  return out
}

export const REASON_LABELS: Record<string, string> = {
  timing: "Timing (billed in another month)",
  prebill: "Prebill agreed with the client",
  client_agreed: "Agreed with the client",
  schedule_incomplete: "Plan schedule is incomplete",
  other: "Other (add a note)",
}

export function ledgerLabel(a: TrueUpActionRef): string {
  const comp = TRUE_UP_COMPONENT_LABELS[a.component]
  switch (a.action) {
    case "schedule":
      return `${comp}: schedule trued up (${a.strategy ?? "carry"}${a.months.length > 0 ? `, ${a.months.join(", ")}` : ""})`
    case "explained":
      return `${comp}: explained, ${REASON_LABELS[a.reasonCode ?? ""] ?? a.reasonCode ?? ""}${a.note ? `. ${a.note}` : ""}`
    case "one_off":
      return `${comp}: ${a.amountCents >= 0 ? "credit" : "charge"} to raise${a.note ? `. ${a.note}` : ""}`
    case "credit_note":
      return `${comp}: credit note to raise against ${a.xeroInvoiceId ?? "an invoice"}`
  }
}

/** Every component a schedule fix could include (anything with a gap, ahead or behind). */
export function fixableComponents(row: TrueUpMbaRow): TrueUpComponent[] {
  return TRUE_UP_COMPONENTS.filter((c) => row.components[c].status !== "matches")
}
