/**
 * FP-2a plan reconciliation (read only). For each client MBA-month, compare the
 * finance figure (approved snapshot, else persisted record total, else the
 * current export total) with the plan of record: billing-basis
 * `schedule_months` on the published version. To the cent. Every gap gets one
 * or more named reasons. Nothing here blocks an export or writes a row.
 *
 * Pure: no I/O. The loader (`loadPlanReconciliation.ts`) builds the inputs.
 * Money is integer cents ex-GST throughout.
 */

import { getMelbourneTodayISO } from "@/lib/dates/melbourne"
import { toCents } from "@/lib/money"
import type { BillingRecord } from "@/lib/types/financeBilling"

/** A gap this size or smaller is called rounding when nothing else explains it. */
export const ROUNDING_TOLERANCE_CENTS = 2

export const PLAN_RECONCILIATION_REASONS = {
  republished_after_approval: "Plan republished after approval",
  approved_differs_from_export: "Approved amount differs from the current export",
  export_reads_other_version: "Export reads a different version from the published one",
  fee_rows_missing: "Fee missing from schedule_months (C-94)",
  fee_differs: "Fee differs between export and schedule_months",
  adserving_rows_missing: "Ad serving missing from schedule_months",
  adserving_differs: "Ad serving differs between export and schedule_months",
  production_counted_twice: "Production counted twice in schedule_months",
  client_pays_in_plan: "Client-pays media in the billing rows",
  not_in_plan: "No billing rows in the plan for this month",
  not_in_export: "Plan bills this month but finance has no row",
  rounding: "Rounding (2 cents or less)",
  unexplained: "Unexplained",
} as const

export type PlanReconciliationReason = keyof typeof PLAN_RECONCILIATION_REASONS

/** Billing-basis schedule_months facts for one published version and month. */
export type PlanMonthFacts = {
  versionId: number
  publishedAt: string | null
  rowCount: number
  totalCents: number
  feeCents: number
  adservingCents: number
  /** `__service__production` rows (component media). */
  serviceProductionCents: number
  /** Per-line production rows (bare `...PROD1` or decorated production ids). */
  lineProductionCents: number
  /** Billing media rows on lines flagged client_pays_for_media. */
  clientPaysMediaCents: number
}

/** The export the To bill page shows (derived from the version schedule). */
export type ExportMonthFacts = {
  versionId: number | null
  totalCents: number
  feeCents: number
  adservingCents: number
  productionCents: number
}

/** Persisted finance_billing_records row (app rows only, never `xero:`). */
export type RecordMonthFacts = {
  invoiceKey: string
  totalCents: number | null
  approvedCents: number | null
  approvedAt: string | null
}

export type PlanReconciliationInput = {
  month: string
  mbaNumber: string
  clientName: string
  clientsId: number | null
  campaignName: string
  plan: PlanMonthFacts | null
  exported: ExportMonthFacts | null
  record: RecordMonthFacts | null
}

export type FinanceSource = "approved snapshot" | "record total" | "export" | ""

export type PlanReconciliationStatus = "match" | "gap"

export type PlanReconciliationRow = {
  month: string
  mbaNumber: string
  clientName: string
  clientsId: number | null
  campaignName: string
  planCents: number | null
  exportCents: number | null
  recordCents: number | null
  financeCents: number | null
  financeSource: FinanceSource
  /** finance minus plan. Null only when neither side has a figure. */
  gapCents: number | null
  /** export minus plan, when both exist. */
  exportGapCents: number | null
  feeGapCents: number | null
  adservingGapCents: number | null
  status: PlanReconciliationStatus
  reasons: PlanReconciliationReason[]
  reasonText: string
}

export type PlanReconciliationReport = {
  month: string
  rows: PlanReconciliationRow[]
  kpis: {
    mbaMonths: number
    matched: number
    gaps: number
    netGapCents: number
    absGapCents: number
  }
}

export function isBillingMonth(value: string | null | undefined): value is string {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value)
}

function recordFigure(record: RecordMonthFacts | null): {
  cents: number | null
  source: FinanceSource
} {
  if (!record) return { cents: null, source: "" }
  if (record.approvedCents != null && Number.isFinite(record.approvedCents)) {
    return { cents: Math.round(record.approvedCents), source: "approved snapshot" }
  }
  if (record.totalCents != null && Number.isFinite(record.totalCents)) {
    return { cents: Math.round(record.totalCents), source: "record total" }
  }
  return { cents: null, source: "" }
}

function timeOf(value: string | null): number | null {
  if (!value) return null
  const t = new Date(value).getTime()
  return Number.isFinite(t) ? t : null
}

function beyond(cents: number): boolean {
  return Math.abs(cents) > ROUNDING_TOLERANCE_CENTS
}

/** Named reasons for one MBA-month with a non-zero gap. Order is stable. */
export function reasonsForGap(input: PlanReconciliationInput, gapCents: number): PlanReconciliationReason[] {
  const { plan, exported, record } = input
  const reasons: PlanReconciliationReason[] = []

  if (!plan || plan.rowCount === 0) return ["not_in_plan"]

  const financial = recordFigure(record)
  if (financial.cents == null && !exported) return ["not_in_export"]

  if (record && financial.source === "approved snapshot") {
    const approvedAt = timeOf(record.approvedAt)
    const publishedAt = timeOf(plan.publishedAt)
    const exportDiffers = exported == null || exported.totalCents !== financial.cents
    if (approvedAt != null && publishedAt != null && publishedAt > approvedAt && exportDiffers) {
      reasons.push("republished_after_approval")
    } else if (exported && beyond(exported.totalCents - (financial.cents ?? 0))) {
      reasons.push("approved_differs_from_export")
    }
  }

  if (exported && exported.versionId != null && exported.versionId !== plan.versionId) {
    reasons.push("export_reads_other_version")
  }

  if (exported) {
    if (plan.feeCents === 0 && beyond(exported.feeCents)) reasons.push("fee_rows_missing")
    else if (beyond(exported.feeCents - plan.feeCents)) reasons.push("fee_differs")

    if (plan.adservingCents === 0 && beyond(exported.adservingCents)) reasons.push("adserving_rows_missing")
    else if (beyond(exported.adservingCents - plan.adservingCents)) reasons.push("adserving_differs")
  }

  if (plan.serviceProductionCents !== 0 && plan.lineProductionCents !== 0) {
    reasons.push("production_counted_twice")
  }
  if (plan.clientPaysMediaCents !== 0) reasons.push("client_pays_in_plan")

  if (reasons.length === 0) {
    reasons.push(beyond(gapCents) ? "unexplained" : "rounding")
  }
  return reasons
}

export function reconcilePlanMonth(input: PlanReconciliationInput): PlanReconciliationRow {
  const planCents = input.plan && input.plan.rowCount > 0 ? input.plan.totalCents : null
  const exportCents = input.exported ? input.exported.totalCents : null
  const fromRecord = recordFigure(input.record)
  const financeCents = fromRecord.cents ?? exportCents
  const financeSource: FinanceSource =
    fromRecord.cents != null ? fromRecord.source : exportCents != null ? "export" : ""

  let gapCents: number | null = null
  if (financeCents != null || planCents != null) {
    gapCents = (financeCents ?? 0) - (planCents ?? 0)
  }
  const exportGapCents =
    exportCents != null && planCents != null ? exportCents - planCents : null
  const feeGapCents =
    input.exported && input.plan ? input.exported.feeCents - input.plan.feeCents : null
  const adservingGapCents =
    input.exported && input.plan ? input.exported.adservingCents - input.plan.adservingCents : null

  const status: PlanReconciliationStatus = gapCents == null || gapCents === 0 ? "match" : "gap"
  const reasons = status === "gap" ? reasonsForGap(input, gapCents ?? 0) : []

  return {
    month: input.month,
    mbaNumber: input.mbaNumber,
    clientName: input.clientName,
    clientsId: input.clientsId,
    campaignName: input.campaignName,
    planCents,
    exportCents,
    recordCents: fromRecord.cents,
    financeCents,
    financeSource,
    gapCents,
    exportGapCents,
    feeGapCents,
    adservingGapCents,
    status,
    reasons,
    reasonText: reasons.map((r) => PLAN_RECONCILIATION_REASONS[r]).join("; "),
  }
}

/** MBA join key. Stored MBA numbers mix case (bicau008, BICAU002). */
export function mbaKey(mba: string | null | undefined): string {
  return String(mba ?? "").trim().toLowerCase()
}

export function buildPlanReconciliation(
  month: string,
  inputs: PlanReconciliationInput[],
): PlanReconciliationReport {
  const rows = inputs
    .map(reconcilePlanMonth)
    .filter((row) => row.planCents !== 0 || (row.financeCents ?? 0) !== 0)
    .sort(
      (a, b) =>
        Number(b.status === "gap") - Number(a.status === "gap") ||
        a.clientName.localeCompare(b.clientName) ||
        a.mbaNumber.localeCompare(b.mbaNumber),
    )
  const gaps = rows.filter((row) => row.status === "gap")
  return {
    month,
    rows,
    kpis: {
      mbaMonths: rows.length,
      matched: rows.length - gaps.length,
      gaps: gaps.length,
      netGapCents: gaps.reduce((sum, row) => sum + (row.gapCents ?? 0), 0),
      absGapCents: gaps.reduce((sum, row) => sum + Math.abs(row.gapCents ?? 0), 0),
    },
  }
}

/** Current Melbourne month, `YYYY-MM`. */
export function defaultReconciliationMonth(now: Date = new Date()): string {
  return getMelbourneTodayISO(now).slice(0, 7)
}

function shiftMonth(month: string, delta: number): string {
  const y = Number(month.slice(0, 4))
  const m = Number(month.slice(5, 7)) - 1 + delta
  const year = y + Math.floor(m / 12)
  const mm = ((m % 12) + 12) % 12
  return `${year}-${String(mm + 1).padStart(2, "0")}`
}

/** Month picker: six months back to two ahead of the current Melbourne month, newest first. */
export function reconciliationMonthOptions(now: Date = new Date()): string[] {
  const current = defaultReconciliationMonth(now)
  const out: string[] = []
  for (let delta = 2; delta >= -6; delta -= 1) out.push(shiftMonth(current, delta))
  return out
}

export function planReconciliationFilename(month: string): string {
  return `plan-reconciliation-${month}.xlsx`
}

export const PLAN_RECONCILIATION_COLUMNS = [
  "month",
  "client",
  "MBA",
  "campaign",
  "plan (schedule_months billing)",
  "finance figure",
  "finance source",
  "export (To bill)",
  "gap (finance minus plan)",
  "export gap (export minus plan)",
  "status",
  "reasons",
] as const

function intCents(value: unknown): number {
  if (value == null || value === "") return 0
  const n = Number(value)
  return Number.isFinite(n) ? Math.round(n) : 0
}

/** Dollars to integer cents through lib/money (half-up, away from zero). */
function dollarsToWholeCents(value: unknown): number {
  const n = typeof value === "number" ? value : Number(String(value ?? "").replace(/[$,\s]/g, ""))
  if (!Number.isFinite(n)) return 0
  return toCents(n)
}

/** Export facts from one composed To bill record (derived from the version schedule). */
export function exportFactsFromRecord(record: Pick<BillingRecord, "total" | "line_items" | "media_plan_version_id">): ExportMonthFacts {
  let feeCents = 0
  let adservingCents = 0
  let productionCents = 0
  for (const line of record.line_items ?? []) {
    if (line.line_type === "media") continue
    const cents = dollarsToWholeCents(line.amount)
    if (line.item_code === "Service") feeCents += cents
    else if (line.item_code === "T.Adserving") adservingCents += cents
    else if (line.item_code === "Production") productionCents += cents
  }
  const versionId = Number(record.media_plan_version_id)
  return {
    versionId: Number.isFinite(versionId) && versionId > 0 ? versionId : null,
    totalCents: dollarsToWholeCents(record.total),
    feeCents,
    adservingCents,
    productionCents,
  }
}

/** Row shape of the loader's schedule_months query. */
export type PlanFactsSqlRow = {
  mba_number: string | null
  client_id: number | string | null
  mp_client_name: string | null
  campaign_name: string | null
  version_id: number | string
  published_at: string | null
  row_count: number | string | null
  total_cents: number | string | null
  fee_cents: number | string | null
  adserving_cents: number | string | null
  service_production_cents: number | string | null
  line_production_cents: number | string | null
  client_pays_media_cents: number | string | null
}

export function planFactsFromSqlRow(row: PlanFactsSqlRow): PlanMonthFacts {
  return {
    versionId: intCents(row.version_id),
    publishedAt: row.published_at == null ? null : String(row.published_at),
    rowCount: intCents(row.row_count),
    totalCents: intCents(row.total_cents),
    feeCents: intCents(row.fee_cents),
    adservingCents: intCents(row.adserving_cents),
    serviceProductionCents: intCents(row.service_production_cents),
    lineProductionCents: intCents(row.line_production_cents),
    clientPaysMediaCents: intCents(row.client_pays_media_cents),
  }
}

/** Row shape of the loader's finance_billing_records query. */
export type RecordFactsSqlRow = {
  invoice_key: string
  mba_number: string | null
  clients_id: number | string | null
  client_name: string | null
  campaign_name: string | null
  total: number | string | null
  approved_amount_cents: number | string | null
  approved_at: string | null
}

export function recordFactsFromSqlRow(row: RecordFactsSqlRow): RecordMonthFacts {
  return {
    invoiceKey: row.invoice_key,
    totalCents: row.total == null || row.total === "" ? null : dollarsToWholeCents(row.total),
    approvedCents:
      row.approved_amount_cents == null || row.approved_amount_cents === ""
        ? null
        : intCents(row.approved_amount_cents),
    approvedAt: row.approved_at == null ? null : String(row.approved_at),
  }
}

function idOrNull(value: unknown): number | null {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null
}

/**
 * Join plan, export and record facts on the MBA (case-insensitive) into one
 * input per MBA-month. Names prefer the plan, then the record, then the export.
 */
export function joinPlanReconciliationInputs(input: {
  month: string
  plans: PlanFactsSqlRow[]
  records: RecordFactsSqlRow[]
  exported: Array<Pick<BillingRecord, "mba_number" | "client_name" | "clients_id" | "campaign_name" | "total" | "line_items" | "media_plan_version_id">>
}): PlanReconciliationInput[] {
  const byKey = new Map<string, PlanReconciliationInput>()
  const slot = (mba: string | null | undefined): PlanReconciliationInput | null => {
    const key = mbaKey(mba)
    if (!key) return null
    let row = byKey.get(key)
    if (!row) {
      row = {
        month: input.month,
        mbaNumber: String(mba ?? "").trim(),
        clientName: "",
        clientsId: null,
        campaignName: "",
        plan: null,
        exported: null,
        record: null,
      }
      byKey.set(key, row)
    }
    return row
  }

  for (const p of input.plans) {
    const row = slot(p.mba_number)
    if (!row) continue
    row.plan = planFactsFromSqlRow(p)
    row.clientName = row.clientName || String(p.mp_client_name ?? "").trim()
    row.clientsId = row.clientsId ?? idOrNull(p.client_id)
    row.campaignName = row.campaignName || String(p.campaign_name ?? "").trim()
  }
  for (const r of input.records) {
    const row = slot(r.mba_number)
    if (!row) continue
    row.record = recordFactsFromSqlRow(r)
    row.clientName = row.clientName || String(r.client_name ?? "").trim()
    row.clientsId = row.clientsId ?? idOrNull(r.clients_id)
    row.campaignName = row.campaignName || String(r.campaign_name ?? "").trim()
  }
  for (const e of input.exported) {
    const row = slot(e.mba_number)
    if (!row) continue
    const facts = exportFactsFromRecord(e)
    // Two composed rows for one MBA-month (should not happen): sum them so the gap shows.
    row.exported = row.exported
      ? {
          ...row.exported,
          totalCents: row.exported.totalCents + facts.totalCents,
          feeCents: row.exported.feeCents + facts.feeCents,
          adservingCents: row.exported.adservingCents + facts.adservingCents,
          productionCents: row.exported.productionCents + facts.productionCents,
        }
      : facts
    row.clientName = row.clientName || String(e.client_name ?? "").trim()
    row.clientsId = row.clientsId ?? idOrNull(e.clients_id)
    row.campaignName = row.campaignName || String(e.campaign_name ?? "").trim()
  }
  return [...byKey.values()]
}
