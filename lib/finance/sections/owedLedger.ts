/**
 * Debtors ledger (CB-4) — report-only ageing over live Xero AR.
 *
 * Outstanding population: AUTHORISED with amount_due > 0.
 * VOIDED / DELETED / PAID never enter a bucket or total.
 * Amounts are integer cents, ex-GST (T0-2): Amount = sub_total;
 * outstanding scales amount_due by sub_total/total when partially paid.
 */

import { resolveBillingState, type BillingState } from "@/lib/finance/billingLifecycle"
import { dollarsToCents } from "@/lib/xero/money"

export const OWED_UNRESOLVED_CLIENT_LABEL = "Unresolved client"

export const OWED_BUCKET_IDS = [
  "not_yet_due",
  "d1_14",
  "d15_30",
  "d31_60",
  "d60_plus",
] as const

export type OwedBucket = (typeof OWED_BUCKET_IDS)[number]

export type OwedBucketTotals = {
  count: number
  amountCents: number
}

export type OwedSourceInvoice = {
  id: string
  invoiceNumber: string
  reference: string | null
  issueDate: string | null
  dueDate: string | null
  status: string
  subTotal: number
  totalIncGst: number
  amountPaid: number
  amountDue: number
  fullyPaidDate: string | null
  pdfAvailable: boolean
  resolved: boolean
  clientsId: number | null
  clientName: string | null
  contactName: string | null
}

export type OwedLedgerRow = {
  invoiceKey: string
  invoiceNumber: string
  reference: string | null
  issueDate: string | null
  dueDate: string | null
  clientName: string
  clientsId: number | null
  resolved: boolean
  group: "client" | "unresolved"
  contactName: string | null
  totalCents: number
  paidCents: number
  outstandingCents: number
  daysOverdue: number
  bucket: OwedBucket
  state: BillingState
  pdfAvailable: boolean
}

export type OwedLedgerCoverage = {
  resolvedCount: number
  unresolvedCount: number
  totalCount: number
  resolvedPct: number
  unresolvedAmountCents: number
}

export type OwedLedger = {
  rows: OwedLedgerRow[]
  totals: {
    count: number
    outstandingCents: number
    totalCents: number
    paidCents: number
  }
  buckets: Record<OwedBucket, OwedBucketTotals>
  coverage: OwedLedgerCoverage
}

export type OwedLedgerPayload = OwedLedger & {
  asOf: string
  scope: {
    fy: number | null
    from: string | null
    to: string | null
    clients: number[]
    bucket: OwedBucket | null
    search: string
  }
}

export type BuildOwedLedgerOptions = {
  todayYmd: string
  clients?: number[]
  bucket?: OwedBucket | null
  search?: string | null
}

const MS_PER_DAY = 86_400_000

function parseYmdUtc(value: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim())
  if (!m) return null
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

export function daysOverdue(dueYmd: string | null, todayYmd: string): number {
  if (!dueYmd) return 0
  const due = parseYmdUtc(dueYmd)
  const today = parseYmdUtc(todayYmd)
  if (due == null || today == null) return 0
  const days = Math.round((today - due) / MS_PER_DAY)
  return days > 0 ? days : 0
}

export function bucketForDaysOverdue(days: number): OwedBucket {
  if (days <= 0) return "not_yet_due"
  if (days <= 14) return "d1_14"
  if (days <= 30) return "d15_30"
  if (days <= 60) return "d31_60"
  return "d60_plus"
}

export function isLiveOutstandingAr(status: string, amountDue: number): boolean {
  const s = status.trim().toUpperCase()
  if (s === "VOIDED" || s === "DELETED") return false
  if (s === "PAID") return false
  if (s !== "AUTHORISED") return false
  return Number.isFinite(amountDue) && amountDue > 0
}

export function isOwedBucket(value: string): value is OwedBucket {
  return (OWED_BUCKET_IDS as readonly string[]).includes(value)
}

function emptyBuckets(): Record<OwedBucket, OwedBucketTotals> {
  return {
    not_yet_due: { count: 0, amountCents: 0 },
    d1_14: { count: 0, amountCents: 0 },
    d15_30: { count: 0, amountCents: 0 },
    d31_60: { count: 0, amountCents: 0 },
    d60_plus: { count: 0, amountCents: 0 },
  }
}

/** Remaining ex-GST cents. Fully unpaid invoices use sub_total; partials scale by GST-inclusive total. */
export function outstandingExGstCents(src: OwedSourceInvoice): number {
  if (!(src.amountDue > 0)) return 0
  if (src.amountPaid > 0 && src.totalIncGst > 0) {
    return dollarsToCents(src.amountDue * (src.subTotal / src.totalIncGst))
  }
  return dollarsToCents(src.subTotal)
}

function todayDateFromYmd(ymd: string): Date {
  const parsed = parseYmdUtc(ymd)
  if (parsed == null) return new Date()
  return new Date(parsed + 2 * 60 * 60 * 1000)
}

function matchesSearch(src: OwedSourceInvoice, q: string): boolean {
  const unresolvedLabel = src.resolved ? "" : OWED_UNRESOLVED_CLIENT_LABEL
  const hay = [
    src.invoiceNumber,
    src.reference ?? "",
    src.clientName ?? "",
    src.contactName ?? "",
    unresolvedLabel,
  ]
    .join(" ")
    .toLowerCase()
  return hay.includes(q)
}

export function buildOwedLedger(
  sources: OwedSourceInvoice[],
  options: BuildOwedLedgerOptions
): OwedLedger {
  const todayYmd = options.todayYmd
  const today = todayDateFromYmd(todayYmd)
  const clientIds = (options.clients ?? []).filter((id) => Number.isFinite(id) && id > 0)
  const search = options.search?.trim().toLowerCase() ?? ""

  let live = sources.filter((src) => isLiveOutstandingAr(src.status, src.amountDue))
  if (search) live = live.filter((src) => matchesSearch(src, search))
  if (clientIds.length > 0) {
    const allow = new Set(clientIds)
    live = live.filter((src) => !src.resolved || (src.clientsId != null && allow.has(src.clientsId)))
  }

  const buckets = emptyBuckets()
  let resolvedCount = 0
  let unresolvedCount = 0
  let unresolvedAmountCents = 0
  let outstandingCents = 0
  let totalCents = 0
  let paidCents = 0

  const allRows: OwedLedgerRow[] = []
  for (const src of live) {
    const total = dollarsToCents(src.subTotal)
    const outstanding = outstandingExGstCents(src)
    const paid = Math.max(0, total - outstanding)
    const days = daysOverdue(src.dueDate, todayYmd)
    const bucket = bucketForDaysOverdue(days)
    const resolved = src.resolved === true && src.clientsId != null && src.clientsId > 0
    const { state } = resolveBillingState({
      approvedAt: null,
      exportedAt: null,
      xero: {
        status: src.status,
        amountDue: src.amountDue,
        dueDate: src.dueDate,
        fullyPaidDate: src.fullyPaidDate,
      },
      today,
    })

    buckets[bucket].count += 1
    buckets[bucket].amountCents += outstanding
    outstandingCents += outstanding
    totalCents += total
    paidCents += paid
    if (resolved) {
      resolvedCount += 1
    } else {
      unresolvedCount += 1
      unresolvedAmountCents += outstanding
    }

    allRows.push({
      invoiceKey: src.id,
      invoiceNumber: src.invoiceNumber,
      reference: src.reference,
      issueDate: src.issueDate,
      dueDate: src.dueDate,
      clientName: resolved
        ? (src.clientName?.trim() || src.contactName?.trim() || `Client ${src.clientsId}`)
        : OWED_UNRESOLVED_CLIENT_LABEL,
      clientsId: resolved ? src.clientsId : null,
      resolved,
      group: resolved ? "client" : "unresolved",
      contactName: src.contactName,
      totalCents: total,
      paidCents: paid,
      outstandingCents: outstanding,
      daysOverdue: days,
      bucket,
      state,
      pdfAvailable: src.pdfAvailable,
    })
  }

  const totalCount = allRows.length
  const coverage: OwedLedgerCoverage = {
    resolvedCount,
    unresolvedCount,
    totalCount,
    resolvedPct: totalCount === 0 ? 100 : Math.round((resolvedCount / totalCount) * 1000) / 10,
    unresolvedAmountCents,
  }

  const bucketFilter = options.bucket ?? null
  const rows = bucketFilter ? allRows.filter((r) => r.bucket === bucketFilter) : allRows

  return {
    rows,
    totals: {
      count: totalCount,
      outstandingCents,
      totalCents,
      paidCents,
    },
    buckets,
    coverage,
  }
}
