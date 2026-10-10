/**
 * Invoiced vs expected. A view over plan billing rows and Xero AR invoices.
 * Expected is the approved snapshot, else the schedule month total, else
 * legacy billed amount. Delta is invoiced minus expected, ex-GST cents.
 */

import { currentFy } from "@/lib/dates/auFinancialYear"

export const XERO_PAIR_TOLERANCE_CENTS = 100

export const INVOICED_VS_EXPECTED_COLUMNS = [
  "month",
  "client",
  "MBA / scope id / retainer",
  "type",
  "expected (AV)",
  "source",
  "invoiced (Xero sub_total ex-GST)",
  "delta (invoiced minus expected)",
  "invoice number",
  "Xero status",
  "resolution",
] as const

export type FyChoice = "fy26" | "fy27" | "all"

/** Report windows this page can select. Current Melbourne FY maps onto them. */
export function defaultInvoicedVsExpectedFy(now: Date = new Date()): FyChoice {
  return currentFy(now) <= 2025 ? "fy26" : "fy27"
}
export type TypeChoice = "all" | "media" | "sow" | "retainer"
export type ViewChoice = "differences" | "all" | "unmatched_invoices" | "unmatched_months"
export type ExpectedSourceLabel = "approved snapshot" | "schedule" | "billed_amount"
export type ResolutionLabel = "agrees" | "auto_adopted" | "adopted" | "disputed" | "open"

export type PlanExpectedRow = {
  invoiceKey: string
  billingMonth: string
  clientName: string
  clientsId: number | null
  mbaNumber: string
  campaignName: string
  billingType: string
  approvedAmountCents: number | null
  scheduleCents: number | null
  billedAmountCents: number | null
  matchedXeroInvoiceId: string | null
  xeroMatchResolution: string | null
  invoiceNumber: string | null
  xeroStatus: string | null
  subTotalCents: number | null
}

export type UnmatchedInvoiceRow = {
  xeroInvoiceId: string
  invoiceNumber: string | null
  status: string | null
  subTotalCents: number | null
  issueMonth: string | null
  contactName: string
  clientId: number | null
}

export type InvoicedVsExpectedFilters = {
  fy: FyChoice
  clientId: number | null
  type: TypeChoice
  view: ViewChoice
}

export type PairRow = {
  month: string
  clientName: string
  clientsId: number | null
  reference: string
  billingType: string
  expectedCents: number | null
  source: ExpectedSourceLabel | ""
  invoicedCents: number | null
  deltaCents: number | null
  invoiceNumber: string
  xeroStatus: string
  resolution: ResolutionLabel | ""
  kind: "pair" | "unmatched_invoice" | "unmatched_month"
}

export type InvoicedVsExpectedReport = {
  pairs: PairRow[]
  unmatchedInvoices: PairRow[]
  unmatchedMonths: PairRow[]
  /** Rows for the active view (the Excel sheet and the main table). */
  rows: PairRow[]
  clientOptions: { id: number; name: string }[]
  kpis: {
    invoicesInScope: number
    matched: number
    differOverDollar: number
    netDeltaCents: number
    invoicesWithNoPlanMonth: number
  }
}

const VOID = new Set(["DELETED", "VOIDED"])

export function fyMonthWindow(fy: FyChoice): { from: string; to: string } {
  if (fy === "fy26") return { from: "2025-07", to: "2026-07" }
  if (fy === "fy27") return { from: "2026-07", to: "2027-07" }
  return { from: "2025-07", to: "9999-99" }
}

export function monthInFy(month: string | null, fy: FyChoice): boolean {
  const value = (month ?? "").slice(0, 7)
  if (!/^\d{4}-\d{2}$/.test(value)) return false
  const { from, to } = fyMonthWindow(fy)
  return value >= from && value < to
}

export function invoicedVsExpectedFilename(fy: FyChoice): string {
  return `invoiced-vs-expected-${fy}.xlsx`
}

export function formatSignedDelta(cents: number): string {
  const sign = cents < 0 ? "−" : cents > 0 ? "+" : ""
  const abs = Math.abs(cents)
  const dollars = Math.floor(abs / 100).toLocaleString("en-AU")
  const frac = String(abs % 100).padStart(2, "0")
  return `${sign}${dollars}.${frac}`
}

function expectedOf(row: PlanExpectedRow): { cents: number; source: ExpectedSourceLabel } | null {
  if (row.approvedAmountCents != null && Number.isFinite(row.approvedAmountCents)) {
    return { cents: Math.round(row.approvedAmountCents), source: "approved snapshot" }
  }
  if (row.scheduleCents != null && Number.isFinite(row.scheduleCents)) {
    return { cents: Math.round(row.scheduleCents), source: "schedule" }
  }
  if (row.billedAmountCents != null && Number.isFinite(row.billedAmountCents)) {
    return { cents: Math.round(row.billedAmountCents), source: "billed_amount" }
  }
  return null
}

function resolutionOf(deltaCents: number, stored: string | null): ResolutionLabel {
  const value = (stored ?? "").trim()
  if (value === "auto_adopted" || value === "adopted" || value === "disputed") return value
  if (Math.abs(deltaCents) <= XERO_PAIR_TOLERANCE_CENTS) return "agrees"
  return "open"
}

function referenceOf(row: PlanExpectedRow): string {
  if (row.billingType === "retainer") return row.mbaNumber || row.campaignName || "Retainer"
  return row.mbaNumber || row.campaignName || ""
}

function liveMatch(row: PlanExpectedRow): boolean {
  const status = (row.xeroStatus ?? "").trim().toUpperCase()
  if (!row.matchedXeroInvoiceId) return false
  if (!status || VOID.has(status)) return false
  if (row.subTotalCents == null || !Number.isFinite(row.subTotalCents)) return false
  return true
}

function pairFromPlan(row: PlanExpectedRow): PairRow {
  const expected = expectedOf(row)
  const invoiced = row.subTotalCents == null ? null : Math.round(row.subTotalCents)
  const delta =
    expected != null && invoiced != null ? invoiced - expected.cents : null
  return {
    month: row.billingMonth.slice(0, 7),
    clientName: row.clientName,
    clientsId: row.clientsId,
    reference: referenceOf(row),
    billingType: row.billingType,
    expectedCents: expected?.cents ?? null,
    source: expected?.source ?? "",
    invoicedCents: invoiced,
    deltaCents: delta,
    invoiceNumber: row.invoiceNumber ?? "",
    xeroStatus: row.xeroStatus ?? "",
    resolution: delta == null ? "" : resolutionOf(delta, row.xeroMatchResolution),
    kind: "pair",
  }
}

function typeOk(billingType: string, type: TypeChoice): boolean {
  if (type === "all") return true
  return billingType === type
}

function clientOk(clientsId: number | null, clientId: number | null): boolean {
  if (clientId == null) return true
  return clientsId === clientId
}

export function buildInvoicedVsExpected(input: InvoicedVsExpectedFilters & {
  plans: PlanExpectedRow[]
  invoices: UnmatchedInvoiceRow[]
}): InvoicedVsExpectedReport {
  const plans = input.plans.filter((row) => monthInFy(row.billingMonth, input.fy))
  const clientOptions = new Map<number, string>()
  for (const row of plans) {
    if (row.clientsId != null && row.clientsId > 0) {
      clientOptions.set(row.clientsId, row.clientName || `Client ${row.clientsId}`)
    }
  }

  const scopedPlans = plans.filter(
    (row) => clientOk(row.clientsId, input.clientId) && typeOk(row.billingType, input.type),
  )

  const pairs: PairRow[] = []
  const unmatchedMonths: PairRow[] = []
  const matchedInvoiceIds = new Set<string>()
  for (const row of scopedPlans) {
    if (liveMatch(row)) {
      pairs.push(pairFromPlan(row))
      matchedInvoiceIds.add(row.matchedXeroInvoiceId!)
    } else {
      const expected = expectedOf(row)
      unmatchedMonths.push({
        month: row.billingMonth.slice(0, 7),
        clientName: row.clientName,
        clientsId: row.clientsId,
        reference: referenceOf(row),
        billingType: row.billingType,
        expectedCents: expected?.cents ?? null,
        source: expected?.source ?? "",
        invoicedCents: null,
        deltaCents: null,
        invoiceNumber: "",
        xeroStatus: "",
        resolution: "",
        kind: "unmatched_month",
      })
    }
  }

  const unmatchedInvoices: PairRow[] = []
  for (const invoice of input.invoices) {
    if (!monthInFy(invoice.issueMonth, input.fy)) continue
    if (!clientOk(invoice.clientId, input.clientId)) continue
    const status = (invoice.status ?? "").trim().toUpperCase()
    if (!status || VOID.has(status)) continue
    unmatchedInvoices.push({
      month: (invoice.issueMonth ?? "").slice(0, 7),
      clientName: invoice.contactName,
      clientsId: invoice.clientId,
      reference: "",
      billingType: "",
      expectedCents: null,
      source: "",
      invoicedCents: invoice.subTotalCents == null ? null : Math.round(invoice.subTotalCents),
      deltaCents: null,
      invoiceNumber: invoice.invoiceNumber ?? "",
      xeroStatus: invoice.status ?? "",
      resolution: "",
      kind: "unmatched_invoice",
    })
  }

  pairs.sort((a, b) => a.month.localeCompare(b.month) || a.clientName.localeCompare(b.clientName) || a.reference.localeCompare(b.reference))
  unmatchedInvoices.sort((a, b) => a.month.localeCompare(b.month) || a.invoiceNumber.localeCompare(b.invoiceNumber))
  unmatchedMonths.sort((a, b) => a.month.localeCompare(b.month) || a.clientName.localeCompare(b.clientName))

  const differ = pairs.filter((row) => row.deltaCents != null && Math.abs(row.deltaCents) > XERO_PAIR_TOLERANCE_CENTS)
  const rows =
    input.view === "differences"
      ? differ
      : input.view === "unmatched_invoices"
        ? unmatchedInvoices
        : input.view === "unmatched_months"
          ? unmatchedMonths
          : pairs

  const netDeltaCents = pairs.reduce((sum, row) => sum + (row.deltaCents ?? 0), 0)

  return {
    pairs,
    unmatchedInvoices,
    unmatchedMonths,
    rows,
    clientOptions: [...clientOptions.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    kpis: {
      invoicesInScope: matchedInvoiceIds.size + unmatchedInvoices.length,
      matched: matchedInvoiceIds.size,
      differOverDollar: differ.length,
      netDeltaCents,
      invoicesWithNoPlanMonth: unmatchedInvoices.length,
    },
  }
}
