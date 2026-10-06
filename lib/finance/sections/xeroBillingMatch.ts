/**
 * Nightly Xero ↔ app billing match. Pure. Persistence lives in
 * `lib/xero/stages/matchBillingRecords.ts`.
 *
 * Live statuses: DRAFT, SUBMITTED, AUTHORISED, PAID.
 * DELETED and VOIDED unlink. Tolerance is $1 (100 cents), ex-GST sub_total.
 */

import {
  matchMbaAgainstMasters,
  type MbaMaster,
  type ScopeOfWorkRef,
} from "@/lib/xero/matchMba"

export const XERO_MATCH_TOLERANCE_CENTS = 100

const LIVE_STATUSES = new Set(["DRAFT", "SUBMITTED", "AUTHORISED", "PAID"])
const UNLINK_STATUSES = new Set(["DELETED", "VOIDED"])

export type ExpectedSource = "approved_snapshot" | "schedule_month" | "legacy_billed"

export type AppBillingMatchRecord = {
  invoiceKey: string
  clientsId: number | null
  billingType: string | null
  mbaNumber: string | null
  scopeId: string | null
  billingMonth: string | null
  approvedAmountCents: number | null
  scheduleMonthCents: number | null
  legacyBilledCents: number | null
  /** A manual stamp is not a candidate. Unlink still clears it. */
  matchedBy?: string | null
}

export type XeroBillingMatchInvoice = {
  xeroInvoiceId: string
  status: string
  issueDate: string | null
  referenceRaw: string | null
  firstLineDescription: string | null
  subTotalCents: number
  linkedClientId: number | null
}

export type ExpectedAmount = {
  invoiceKey: string
  cents: number
  source: ExpectedSource
}

export type XeroBillingMatchDecision =
  | { kind: "unlink"; xeroInvoiceId: string; status: string }
  | {
      kind: "stamp"
      xeroInvoiceId: string
      invoiceKeys: string[]
      drift: "auto_adopted" | "differs"
      expected: ExpectedAmount[]
      subTotalCents: number
      /** 1:1 auto-adopt writes this onto the single record. Null for N:1 and Differs. */
      adoptCents: number | null
    }
  | { kind: "suggestion"; xeroInvoiceId: string; reason: string }

export function expectedAmount(
  record: Pick<
    AppBillingMatchRecord,
    "approvedAmountCents" | "scheduleMonthCents" | "legacyBilledCents"
  >,
): { cents: number; source: ExpectedSource } | null {
  if (finiteCents(record.approvedAmountCents)) {
    return { cents: Math.round(record.approvedAmountCents!), source: "approved_snapshot" }
  }
  if (finiteCents(record.scheduleMonthCents)) {
    return { cents: Math.round(record.scheduleMonthCents!), source: "schedule_month" }
  }
  if (finiteCents(record.legacyBilledCents)) {
    return { cents: Math.round(record.legacyBilledCents!), source: "legacy_billed" }
  }
  return null
}

/** 0 exact, -1 previous month, +1 next month, null outside ±1. */
export function billingMonthOffset(billingMonth: string | null, issueYmd: string | null): -1 | 0 | 1 | null {
  const month = (billingMonth ?? "").trim().slice(0, 7)
  const issue = (issueYmd ?? "").trim().slice(0, 7)
  if (!/^\d{4}-\d{2}$/.test(month) || !/^\d{4}-\d{2}$/.test(issue)) return null
  const [by, bm] = month.split("-").map(Number)
  const [iy, im] = issue.split("-").map(Number)
  const delta = (by! - iy!) * 12 + (bm! - im!)
  if (delta < -1 || delta > 1) return null
  return delta as -1 | 0 | 1
}

export function firstLineItemDescription(lineItems: unknown): string | null {
  if (!Array.isArray(lineItems) || lineItems.length === 0) return null
  const first = lineItems[0]
  if (!first || typeof first !== "object") return null
  const row = first as { Description?: unknown; description?: unknown }
  const raw = row.Description ?? row.description
  if (typeof raw !== "string") return null
  const trimmed = raw.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function matchXeroInvoicesToAppRecords(input: {
  invoices: XeroBillingMatchInvoice[]
  records: AppBillingMatchRecord[]
  masters: MbaMaster[]
  scopes?: ScopeOfWorkRef[]
}): XeroBillingMatchDecision[] {
  const scopes = input.scopes ?? []
  const used = new Set<string>()
  const out: XeroBillingMatchDecision[] = []
  for (const invoice of input.invoices) {
    const status = invoice.status.trim().toUpperCase()
    if (UNLINK_STATUSES.has(status)) {
      out.push({ kind: "unlink", xeroInvoiceId: invoice.xeroInvoiceId, status })
      continue
    }
    if (!LIVE_STATUSES.has(status)) continue
    const open = input.records.filter((r) => !used.has(r.invoiceKey))
    const decision = decideLive(invoice, open, input.masters, scopes)
    if (decision.kind === "stamp") {
      for (const key of decision.invoiceKeys) used.add(key)
    }
    out.push(decision)
  }
  return out
}

function decideLive(
  invoice: XeroBillingMatchInvoice,
  records: AppBillingMatchRecord[],
  masters: MbaMaster[],
  scopes: ScopeOfWorkRef[],
): XeroBillingMatchDecision {
  const open = records.filter((r) => (r.matchedBy ?? "").trim().toLowerCase() !== "manual")
  const token = referenceToken(invoice.referenceRaw, masters, scopes)
  if (token) {
    const keyed = open.filter((r) => keyHit(r, token))
    const pool = preferExact(inWindow(keyed, invoice.issueDate), invoice.issueDate)
    if (pool.length === 0) {
      return suggestion(invoice, "token_no_record_in_window")
    }
    return stampOrAmbiguous(pool, invoice)
  }

  const clientId = invoice.linkedClientId
  if (clientId != null && clientId > 0) {
    const clientPool = preferExact(
      inWindow(
        open.filter((r) => r.clientsId === clientId),
        invoice.issueDate,
      ),
      invoice.issueDate,
    )
    const singles = clientPool.filter((r) => withinTolerance(r, invoice.subTotalCents))
    if (singles.length === 1) return stampOne(singles[0]!, invoice)
    const summed = sumStamp(clientPool, invoice)
    if (summed) return summed

    const retainer = retainerPick(open, invoice)
    if (retainer) return retainer
  }

  return suggestion(invoice, "no_match")
}

function retainerPick(
  records: AppBillingMatchRecord[],
  invoice: XeroBillingMatchInvoice,
): XeroBillingMatchDecision | null {
  const clientId = invoice.linkedClientId
  if (clientId == null || clientId <= 0) return null
  const month = (invoice.issueDate ?? "").slice(0, 7)
  const hits = records.filter((r) => {
    if (r.clientsId !== clientId) return false
    if ((r.billingMonth ?? "").slice(0, 7) !== month) return false
    return withinTolerance(r, invoice.subTotalCents)
  })
  if (hits.length < 2) return null
  const text = `${invoice.referenceRaw ?? ""} ${invoice.firstLineDescription ?? ""}`
  if (!/retainer/i.test(text)) return null
  const retainers = hits.filter((r) => (r.billingType ?? "").trim().toLowerCase() === "retainer")
  if (retainers.length !== 1) return null
  return stampOne(retainers[0]!, invoice)
}

function stampOrAmbiguous(
  pool: AppBillingMatchRecord[],
  invoice: XeroBillingMatchInvoice,
): XeroBillingMatchDecision {
  if (pool.length === 1) return stampOne(pool[0]!, invoice)
  return sumStamp(pool, invoice) ?? suggestion(invoice, "ambiguous")
}

function sumStamp(
  pool: AppBillingMatchRecord[],
  invoice: XeroBillingMatchInvoice,
): XeroBillingMatchDecision | null {
  if (pool.length < 2) return null
  const expected: ExpectedAmount[] = []
  let sum = 0
  for (const record of pool) {
    const amount = expectedAmount(record)
    if (!amount) return null
    expected.push({ invoiceKey: record.invoiceKey, cents: amount.cents, source: amount.source })
    sum += amount.cents
  }
  if (Math.abs(invoice.subTotalCents - sum) > XERO_MATCH_TOLERANCE_CENTS) return null
  return {
    kind: "stamp",
    xeroInvoiceId: invoice.xeroInvoiceId,
    invoiceKeys: expected.map((e) => e.invoiceKey),
    drift: "auto_adopted",
    expected,
    subTotalCents: invoice.subTotalCents,
    adoptCents: null,
  }
}

function stampOne(
  record: AppBillingMatchRecord,
  invoice: XeroBillingMatchInvoice,
): XeroBillingMatchDecision {
  const amount = expectedAmount(record)
  if (!amount) return suggestion(invoice, "no_expected_amount")
  const delta = Math.abs(invoice.subTotalCents - amount.cents)
  const adopt = delta <= XERO_MATCH_TOLERANCE_CENTS
  return {
    kind: "stamp",
    xeroInvoiceId: invoice.xeroInvoiceId,
    invoiceKeys: [record.invoiceKey],
    drift: adopt ? "auto_adopted" : "differs",
    expected: [{ invoiceKey: record.invoiceKey, cents: amount.cents, source: amount.source }],
    subTotalCents: invoice.subTotalCents,
    adoptCents: adopt ? invoice.subTotalCents : null,
  }
}

function suggestion(invoice: XeroBillingMatchInvoice, reason: string): XeroBillingMatchDecision {
  return { kind: "suggestion", xeroInvoiceId: invoice.xeroInvoiceId, reason }
}

function withinTolerance(record: AppBillingMatchRecord, subTotalCents: number): boolean {
  const amount = expectedAmount(record)
  if (!amount) return false
  return Math.abs(subTotalCents - amount.cents) <= XERO_MATCH_TOLERANCE_CENTS
}

function inWindow(records: AppBillingMatchRecord[], issueDate: string | null): AppBillingMatchRecord[] {
  return records.filter((r) => billingMonthOffset(r.billingMonth, issueDate) != null)
}

function preferExact(records: AppBillingMatchRecord[], issueDate: string | null): AppBillingMatchRecord[] {
  const exact = records.filter((r) => billingMonthOffset(r.billingMonth, issueDate) === 0)
  return exact.length > 0 ? exact : records
}

function referenceToken(
  referenceRaw: string | null,
  masters: MbaMaster[],
  scopes: ScopeOfWorkRef[],
): { mba: string | null; scope: string | null } | null {
  const hit = matchMbaAgainstMasters(referenceRaw ?? "", masters, scopes)
  if (!hit.matched) return null
  if (hit.kind === "mba") return { mba: hit.mba_number, scope: null }
  return { mba: null, scope: hit.scope_id }
}

function keyHit(
  record: AppBillingMatchRecord,
  token: { mba: string | null; scope: string | null },
): boolean {
  const mba = norm(record.mbaNumber)
  const scope = norm(record.scopeId)
  const wantMba = norm(token.mba)
  const wantScope = norm(token.scope)
  if (wantMba && (mba === wantMba || scope === wantMba)) return true
  if (wantScope && (mba === wantScope || scope === wantScope)) return true
  return false
}

function norm(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase()
}

function finiteCents(value: number | null | undefined): value is number {
  return value != null && Number.isFinite(value)
}
