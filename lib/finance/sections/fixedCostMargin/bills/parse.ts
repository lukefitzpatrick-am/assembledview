/**
 * Parse supplier bills (`xero_ap_bills.line_items_json`) into bill lines for
 * the fixed cost margin report. Pure. No I/O. Money is integer cents, ex GST.
 *
 * Shapes seen in the FY27 data (27 Oct 2026):
 * - Channel Factory: a header line with no amount carrying the CF IO
 *   ("... Penfolds Grange Brand AU GO Q3-Q4'26 OP072970 ..."), then one line
 *   per placement ("15s/30s SkippablePL267346"). Fee lines read "7.5% DL Fee"
 *   or "Molicare Skin 7.5%".
 * - Advertising Associates: one line per media owner ("National National
 *   Broadsheet\n\nSun-Sat 16/08/2026 ..."), continuation lines with only a
 *   date take the media owner of the line above, and a header line with no
 *   amount ("Client: ...\nPurchase Order PENFOLD016"). The MBA can be in the
 *   invoice number, a description or the "Client/Campaign" tracking.
 */

import { toCents } from "@/lib/money/cents"
import { aliasPublisherFor, type SupplierKind } from "./suppliers"

export type RawBillRow = {
  billId: number
  xeroInvoiceId: string
  invoiceNumber: string
  referenceRaw: string
  contactName: string
  status: string
  currency: string
  /** YYYY-MM-DD */
  issueDate: string
  /** Exclusive, Inclusive or NoTax */
  lineAmountTypes: string
  lineItems: unknown
}

export type BillLineKind = "media" | "fee" | "production"

export type ParsedBillLine = {
  /** `${xeroInvoiceId}#${lineIndex}` */
  key: string
  billId: number
  xeroInvoiceId: string
  invoiceNumber: string
  supplierKind: SupplierKind
  supplierName: string
  status: string
  currency: string
  issueDate: string
  lineIndex: number
  /** Xero `LineItemID` (the saved manual match key, with the bill id). Empty when Xero sent none. */
  xeroLineItemId: string
  /** Description on one line (whitespace collapsed). */
  description: string
  /** Ex GST. Inclusive bills: LineAmount minus TaxAmount. */
  exGstCents: number
  kind: BillLineKind
  /** CF IO (OP + 6 digits) from the bill header. */
  opId: string | null
  /** CF placement (PL + 6 digits) on the line. */
  plId: string | null
  /** Media owner text (AA), inherited by continuation lines. */
  mediaOwnerText: string
  /** First dd/mm/yyyy on the line, as YYYY-MM-DD. */
  weekDate: string | null
  /** Tracking options other than the "Media" category. */
  tracking: string[]
  /** Invoice number, reference and every description on the bill. */
  billText: string
}

type XeroLine = {
  LineItemID?: unknown
  Description?: unknown
  LineAmount?: unknown
  TaxAmount?: unknown
  Tracking?: unknown
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v)
  return null
}

function text(v: unknown): string {
  return v == null ? "" : String(v)
}

export function collapse(s: string): string {
  return s.replace(/\s+/g, " ").trim()
}

/** Ex GST cents for one line given the bill's LineAmountTypes. */
export function exGstCentsOf(lineAmount: number, taxAmount: number | null, lineAmountTypes: string): number {
  const inclusive = lineAmountTypes.trim().toLowerCase() === "inclusive"
  const dollars = inclusive ? lineAmount - (taxAmount ?? 0) : lineAmount
  return toCents(dollars)
}

const FEE_RE = /7\.5\s*%|\bfee\b/i
const PRODUCTION_RE = /produ|install|talent|hot ?read|\bprod\b/i

/** Fee (CF 7.5% lines), production (production, installation, talent, hot read) or media. */
export function classifyBillLine(description: string): BillLineKind {
  if (FEE_RE.test(description)) return "fee"
  if (PRODUCTION_RE.test(description)) return "production"
  return "media"
}

/** First dd/mm/yyyy in the text as YYYY-MM-DD, or null. */
export function firstWeekDate(description: string): string | null {
  const re = /(\d{2})\/(\d{2})\/(\d{4})/g
  let m: RegExpExecArray | null
  while ((m = re.exec(description))) {
    const dd = Number(m[1])
    const mm = Number(m[2])
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) return `${m[3]}-${m[2]}-${m[1]}`
  }
  return null
}

export function placementIdOf(description: string): string | null {
  const m = description.match(/PL(\d{6})/i)
  return m ? `PL${m[1]}` : null
}

export function ioIdOf(textValue: string): string | null {
  const m = textValue.match(/OP(\d{6})/i)
  return m ? `OP${m[1]}` : null
}

const REGION_PREFIX_RE =
  /^(metropolitan|regional|national)\s+(new south wales|victoria|queensland|western australia|south australia|tasmania|northern territory|australian capital territory|act|national|\(unspecified state\))\s+/i
const CONTINUATION_RE =
  /^(sun-sat|mon-sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{2}\/\d{2}\/\d{4})/i

/**
 * Media owner text from the first line of an AA description, or null when the
 * line is a continuation (starts with a day or a date) or has no text.
 */
export function mediaOwnerTextOf(description: string): string | null {
  const first = collapse(description.split(/\r?\n/)[0] ?? "")
  if (!first) return null
  const owner = first.replace(REGION_PREFIX_RE, "").trim()
  if (!owner || CONTINUATION_RE.test(owner)) return null
  return owner
}

function trackingOptions(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  const out: string[] = []
  for (const t of v) {
    const o = t as { Name?: unknown; Option?: unknown }
    if (text(o.Name).trim().toLowerCase() === "media") continue
    const opt = collapse(text(o.Option))
    if (opt) out.push(opt)
  }
  return out
}

/** Every bill line with an amount. Header lines (no amount) feed `billText` and the CF IO. */
export function parseBill(bill: RawBillRow, supplierKind: SupplierKind): ParsedBillLine[] {
  const items: XeroLine[] = Array.isArray(bill.lineItems) ? (bill.lineItems as XeroLine[]) : []
  const descriptions = items.map((li) => text(li.Description))
  const billText = collapse([bill.invoiceNumber, bill.referenceRaw, ...descriptions].join(" \n "))
  const headerText = descriptions.filter((_, i) => num(items[i]?.LineAmount) == null).join(" ")
  const opId = supplierKind === "channel_factory" ? ioIdOf(headerText) ?? ioIdOf(billText) : null

  const out: ParsedBillLine[] = []
  let owner = ""
  items.forEach((li, index) => {
    const description = descriptions[index] ?? ""
    const amount = num(li.LineAmount)
    if (supplierKind === "advertising_associates") {
      const o = mediaOwnerTextOf(description)
      // Header lines ("Client: ...") reset nothing; only amount lines carry owners.
      if (o && amount != null) owner = o
    }
    if (amount == null || amount === 0) return
    const flat = collapse(description)
    out.push({
      key: `${bill.xeroInvoiceId}#${index}`,
      billId: bill.billId,
      xeroInvoiceId: bill.xeroInvoiceId,
      invoiceNumber: bill.invoiceNumber,
      supplierKind,
      supplierName: bill.contactName,
      status: bill.status.trim().toUpperCase(),
      currency: bill.currency.trim().toUpperCase() || "AUD",
      issueDate: bill.issueDate,
      lineIndex: index,
      xeroLineItemId: text(li.LineItemID).trim(),
      description: flat,
      exGstCents: exGstCentsOf(amount, num(li.TaxAmount), bill.lineAmountTypes),
      kind: classifyBillLine(flat),
      opId,
      plId: supplierKind === "channel_factory" ? placementIdOf(flat) : null,
      mediaOwnerText: supplierKind === "advertising_associates" ? owner : "",
      weekDate: firstWeekDate(description),
      tracking: trackingOptions(li.Tracking),
      billText,
    })
  })
  return out
}

/** Known MBA numbers (lower-case) that appear in the text, in order, no repeats. */
export function findKnownMbas(textValue: string, known: ReadonlySet<string>): string[] {
  const out: string[] = []
  for (const m of textValue.matchAll(/[a-z]+\d{3,}/gi)) {
    const token = m[0].toLowerCase()
    // "PENFOLD016DD4" yields "penfold016"; try the longest known prefix too.
    const candidates = [token]
    const prefix = token.match(/^[a-z]+\d{3}/)
    if (prefix && prefix[0] !== token) candidates.push(prefix[0])
    for (const c of candidates) {
      if (known.has(c) && !out.includes(c)) out.push(c)
    }
  }
  return out
}

/** AV publisher name for AA media owner text via the alias list (re-exported for tests). */
export function mediaOwnerAlias(textValue: string): string | null {
  return aliasPublisherFor(textValue)
}
