/**
 * Five Stones (our DV360 and CM360 reseller) DV360 bills against DV360
 * AMOUNT_SPENT, for the fixed cost margin report (MAR-10, Luke 28 Oct 2026,
 * decision 9 (c): keep AMOUNT_SPENT as the cost, show the Five Stones bill
 * beside it and label the gap).
 *
 * Matching is at MBA-month, not line: each Five Stones DV360 bill line is one
 * DV360 insertion order for one month ("molicare-annual_performance-hartm001-
 * jan26-display - Ad Exchange"), and one IO carries several plan lines
 * (hartm001 display = PD1 + PD2, YouTube = PV1 + PV2). So a bill line is
 * matched to the MBA named in its description, in the bill's issue month
 * (Five Stones bills are dated the last day of the activity month, and the
 * header reads "2026.8.1 to 2026.8.31"). The MBA-month bill is then split
 * over that MBA's DV360 lines in proportion to their DV360 spend that month,
 * so each line shows the same gap % as its MBA-month.
 *
 * Campaign Manager 360 bills (ad serving) are not DV360 media cost and are
 * left out. Xero "Client/Campaign" tracking is not used (it is wrong on these
 * bills, for example "Molicare - C24-HEAVYINCO-0001").
 *
 * Pure. No I/O. Money is integer cents, ex GST.
 */

import { classifyBillStatus, type BillStatusClass } from "./policy"
import { collapse, exGstCentsOf, findKnownMbas, type RawBillRow } from "./parse"

/** Xero contact name of the reseller. */
export const FIVE_STONES_CONTACT = /^five stones\b/i

/** Postgres regex (case-insensitive `~*`) for the Five Stones contact. */
export const FIVE_STONES_CONTACT_SQL_REGEX = "^five stones"

/** Platform spend source label for DV360 in `VW_PLATFORM_SPEND_LINE_MONTH`. */
export const DV360_SPEND_SOURCE = "DV360"

const DV360_HEADER_RE = /display\s*&\s*video\s*360/i

export function isFiveStonesContact(contactName: string): boolean {
  return FIVE_STONES_CONTACT.test(contactName.trim())
}

export type FiveStonesDv360Line = {
  /** `${xeroInvoiceId}#${lineIndex}` */
  key: string
  xeroInvoiceId: string
  invoiceNumber: string
  status: string
  statusClass: BillStatusClass
  issueDate: string
  /** Bill issue month (YYYY-MM): the activity month on Five Stones bills. */
  month: string
  lineIndex: number
  description: string
  exGstCents: number
  /** Lower-case MBA named in the line description, or null. */
  mbaNumber: string | null
  /** Every known MBA in the description (more than one means ambiguous). */
  mbaCandidates: string[]
}

type XeroLine = { Description?: unknown; LineAmount?: unknown; TaxAmount?: unknown }

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v)
  return null
}

/** True when the bill is a DV360 bill (header "Display & Video 360"), not CM360. */
export function isDv360Bill(bill: Pick<RawBillRow, "invoiceNumber" | "referenceRaw" | "lineItems">): boolean {
  const items: XeroLine[] = Array.isArray(bill.lineItems) ? (bill.lineItems as XeroLine[]) : []
  const header = items
    .filter((li) => num(li.LineAmount) == null)
    .map((li) => String(li.Description ?? ""))
    .join(" ")
  return DV360_HEADER_RE.test(header) || DV360_HEADER_RE.test(`${bill.invoiceNumber} ${bill.referenceRaw}`)
}

/** Amount lines of one Five Stones DV360 bill. CM360 bills and bills not in AUD return []. */
export function parseFiveStonesDv360Bill(bill: RawBillRow, knownMbas: ReadonlySet<string>): FiveStonesDv360Line[] {
  if (!isDv360Bill(bill)) return []
  if ((bill.currency.trim().toUpperCase() || "AUD") !== "AUD") return []
  const items: XeroLine[] = Array.isArray(bill.lineItems) ? (bill.lineItems as XeroLine[]) : []
  const status = bill.status.trim().toUpperCase()
  const out: FiveStonesDv360Line[] = []
  items.forEach((li, index) => {
    const amount = num(li.LineAmount)
    if (amount == null || amount === 0) return
    const description = collapse(String(li.Description ?? ""))
    const candidates = findKnownMbas(description, knownMbas)
    out.push({
      key: `${bill.xeroInvoiceId}#${index}`,
      xeroInvoiceId: bill.xeroInvoiceId,
      invoiceNumber: bill.invoiceNumber,
      status,
      statusClass: classifyBillStatus(status),
      issueDate: bill.issueDate,
      month: bill.issueDate.slice(0, 7),
      lineIndex: index,
      description,
      exGstCents: exGstCentsOf(amount, num(li.TaxAmount), bill.lineAmountTypes),
      mbaNumber: candidates.length === 1 ? candidates[0]! : null,
      mbaCandidates: candidates,
    })
  })
  return out
}

/** Five Stones DV360 bill cost for one MBA-month. */
export type Dv360BillCell = {
  mbaNumber: string
  month: string
  /** AUTHORISED and PAID bill lines. */
  countedCents: number
  /** DRAFT and SUBMITTED bill lines (not counted). */
  pendingCents: number
  statuses: string[]
  invoiceNumbers: string[]
}

/** MBA-month cells from parsed lines. Lines with no single MBA, and DELETED or VOIDED bills, are left out. */
export function dv360BillCells(lines: readonly FiveStonesDv360Line[]): Dv360BillCell[] {
  const acc = new Map<string, Dv360BillCell>()
  for (const l of lines) {
    if (!l.mbaNumber || l.statusClass === "ignored") continue
    const key = `${l.mbaNumber}|${l.month}`
    const c =
      acc.get(key) ??
      ({ mbaNumber: l.mbaNumber, month: l.month, countedCents: 0, pendingCents: 0, statuses: [], invoiceNumbers: [] } satisfies Dv360BillCell)
    if (l.statusClass === "counted") c.countedCents += l.exGstCents
    else c.pendingCents += l.exGstCents
    if (!c.statuses.includes(l.status)) c.statuses.push(l.status)
    if (!c.invoiceNumbers.includes(l.invoiceNumber)) c.invoiceNumbers.push(l.invoiceNumber)
    acc.set(key, c)
  }
  return [...acc.values()].sort((a, b) => a.mbaNumber.localeCompare(b.mbaNumber) || a.month.localeCompare(b.month))
}

/** Five Stones DV360 bill lines that name no MBA, or more than one. */
export function unmatchedDv360Lines(lines: readonly FiveStonesDv360Line[]): FiveStonesDv360Line[] {
  return lines.filter((l) => !l.mbaNumber && l.statusClass !== "ignored")
}

/**
 * Plan line id (lower-case) to the MBA it belongs to: the MBA prefix followed
 * by a letter ("hartm001pd1" is hartm001, never hartm0011...). Null when no
 * MBA in the list fits.
 */
export function mbaOfLineId(lineItemId: string, mbas: readonly string[]): string | null {
  const lid = lineItemId.trim().toLowerCase()
  let best: string | null = null
  for (const m of mbas) {
    if (!lid.startsWith(m)) continue
    const next = lid.charAt(m.length)
    if (!/[a-z]/.test(next)) continue
    if (!best || m.length > best.length) best = m
  }
  return best
}

/** DV360 spend (all lines of the MBA, any buy type) by `${mba}|${month}`. */
export function dv360SpendByMbaMonth(
  rows: ReadonlyArray<{ lineItemId: string; month: string; spendCents: number }>,
  mbas: readonly string[]
): Map<string, number> {
  const out = new Map<string, number>()
  for (const r of rows) {
    const mba = mbaOfLineId(r.lineItemId, mbas)
    if (!mba) continue
    const key = `${mba}|${r.month}`
    out.set(key, (out.get(key) ?? 0) + r.spendCents)
  }
  return out
}

/** One MBA-month of the check: what Five Stones billed against DV360 AMOUNT_SPENT. */
export type Dv360CheckCell = Dv360BillCell & {
  /** DV360 AMOUNT_SPENT on every DV360 line of the MBA that month. */
  mbaDv360SpendCents: number
}

export function dv360CheckCells(
  bills: readonly Dv360BillCell[],
  spendByMbaMonth: ReadonlyMap<string, number>
): Dv360CheckCell[] {
  return bills.map((b) => ({ ...b, mbaDv360SpendCents: spendByMbaMonth.get(`${b.mbaNumber}|${b.month}`) ?? 0 }))
}

/** AMOUNT_SPENT minus the Five Stones bill, and that over AMOUNT_SPENT. */
export function dv360Gap(spendCents: number, billCents: number): { gapCents: number; gapPct: number | null } {
  const gapCents = spendCents - billCents
  return { gapCents, gapPct: spendCents ? gapCents / spendCents : null }
}
