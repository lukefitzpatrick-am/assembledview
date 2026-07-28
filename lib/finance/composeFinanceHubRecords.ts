import { derivePayableRecordsForMonth } from "@/lib/finance/derivePayableRecords"
import { derivePlanReceivableBillingRecordsForMonth, receivableMergeKey } from "@/lib/finance/deriveReceivableRecords"
import { deriveRetainerBillingRecordsForMonth } from "@/lib/finance/deriveRetainerReceivables"
import { deriveSowBillingRecordsFromScopes, type ScopeOfWorkRow } from "@/lib/finance/deriveScopeSowReceivables"
import {
  filterByBillingTypes,
  filterByClients,
  filterByPublisherIds,
  filterBySearch,
  filterByStatuses,
  filterPlanVersionsByIncludeDrafts,
} from "@/lib/finance/filterBillingRecords"
import {
  applyStatusOverlay,
  filterPersistedStatusRowsForMonth,
  indexPersistedStatusByInvoiceKey,
  type PersistedFinanceStatusRow,
} from "@/lib/finance/overlayFinanceStatus"
import { attachPlanRowSchedulesForSurface } from "@/lib/finance/rows/attachPlanRowSchedules"
import { financeClientNamesMatch } from "@/lib/finance/utils"
import type { BillingRecord, BillingType } from "@/lib/types/financeBilling"

/**
 * Per-month record composition shared by the single-month and multi-month
 * finance hub API paths (`GET /api/finance/billing`, `GET /api/finance/payables`).
 *
 * This is a pure I/O-free extraction of the routes' original inline pipelines:
 * derive → merge-key dedupe → month filter → status overlay → hub query filters.
 * Both paths MUST go through these functions so a multi-month response is
 * byte-identical to the concatenation of the equivalent single-month responses.
 */

export function buildClientNameMap(clients: Record<string, unknown>[]): Map<string, Record<string, unknown>> {
  const m = new Map<string, Record<string, unknown>>()
  for (const c of clients) {
    const name = String(c.clientname_input ?? c.mp_client_name ?? c.name ?? "").trim()
    if (name) m.set(name, c)
  }
  return m
}

export function buildClientMbaIdentifierMap(
  clients: Record<string, unknown>[]
): Array<{ mbaidentifier: string; id: number; name: string }> {
  const out: Array<{ mbaidentifier: string; id: number; name: string }> = []
  for (const c of clients) {
    const mbaid = String(c.mbaidentifier ?? c.mba_identifier ?? c.mbaIdentifier ?? "").trim()
    const id = Number(c.id)
    const name = String(c.mp_client_name ?? c.clientname_input ?? c.name ?? "").trim()
    if (mbaid && Number.isFinite(id) && id > 0) {
      out.push({ mbaidentifier: mbaid, id, name })
    }
  }
  out.sort((a, b) => b.mbaidentifier.length - a.mbaidentifier.length)
  return out
}

export function buildPublisherIdMap(publishers: Record<string, unknown>[]): Map<number, string> {
  const m = new Map<number, string>()
  for (const p of publishers) {
    const id = Number(p.id)
    const name = String(p.publisher_name ?? "").trim()
    if (Number.isFinite(id) && name) m.set(id, name)
  }
  return m
}

export type HubQueryFilterParams = {
  clientsIdParam: string | null
  searchParam: string | null
  statusParam: string | null
  publishersIdParam: string | null
  types: BillingType[]
}

export type ComposeBillingMonthInputs = {
  /** Calendar month `YYYY-MM`. */
  monthStr: string
  /** Relevant plan versions for THIS month (single-month scoped set). */
  relevantVersions: Record<string, unknown>[]
  clients: Record<string, unknown>[]
  publishers: Record<string, unknown>[]
  /** `null` → SOW-from-scopes derivation is skipped (scope fetch failed or sow not requested). */
  scopes: ScopeOfWorkRow[] | null
  /** Persisted status rows; may be all-months — month scoping happens here. */
  persistedStatusRows: PersistedFinanceStatusRow[]
  includeNonBooked: boolean
} & HubQueryFilterParams

/** One calendar month of receivable records — the billing route's original pipeline verbatim. */
export function composeBillingRecordsForMonth(inputs: ComposeBillingMonthInputs): BillingRecord[] {
  const {
    monthStr,
    relevantVersions,
    clients,
    publishers,
    scopes,
    persistedStatusRows,
    includeNonBooked,
    types,
    clientsIdParam,
    searchParam,
    statusParam,
    publishersIdParam,
  } = inputs

  const wantMedia = types.length === 0 || types.includes("media")
  const wantSow = types.length === 0 || types.includes("sow")
  const wantRetainer = types.length === 0 || types.includes("retainer")
  const year = Number(monthStr.slice(0, 4))
  const month = Number(monthStr.slice(5, 7))

  const clientMap = buildClientNameMap(clients)
  const mbaIdentifiers = buildClientMbaIdentifierMap(clients)
  const publisherNameMap = new Map<string, unknown>()
  for (const p of publishers) {
    const name = String(p.publisher_name ?? "").trim()
    if (name) publisherNameMap.set(name, p)
  }
  const publisherIdMap = buildPublisherIdMap(publishers)

  const derived: BillingRecord[] = []

  if (wantMedia) {
    const fromPlans = derivePlanReceivableBillingRecordsForMonth(
      relevantVersions,
      year,
      month,
      publisherNameMap,
      clientMap,
      mbaIdentifiers,
      { includeNonBookedCampaigns: includeNonBooked }
    )
    derived.push(...fromPlans)
  }

  if (wantSow && scopes !== null) {
    const resolveClientId = (clientName: string): number => {
      const rec = clientMap.get(clientName)
      if (rec?.id != null) return Number(rec.id) || 0
      for (const [name, row] of clientMap.entries()) {
        if (financeClientNamesMatch(clientName, name) && row.id != null) {
          return Number(row.id) || 0
        }
      }
      return 0
    }

    const fromScopes = deriveSowBillingRecordsFromScopes(scopes, year, month, resolveClientId, {
      includeNonApprovedScopes: includeNonBooked,
    })
    derived.push(...fromScopes)
  }

  if (wantRetainer) {
    derived.push(...deriveRetainerBillingRecordsForMonth(clients, year, month))
  }

  const byReceivableKey = new Map<string, BillingRecord>()
  for (const rec of derived) {
    const k = receivableMergeKey(rec)
    if (!byReceivableKey.has(k)) byReceivableKey.set(k, rec)
  }
  let merged = [...byReceivableKey.values()].filter((r) => r.billing_month === monthStr)
  // Domain 5 Stage 2.2a — overlay persisted status onto derived rows.
  // Read-only: amounts and line structure remain authoritative from schedule JSON.
  const monthStatusRows = filterPersistedStatusRowsForMonth(persistedStatusRows, monthStr)
  const statusOverlayMap = indexPersistedStatusByInvoiceKey(monthStatusRows)
  merged = merged.map((rec) => applyStatusOverlay(rec, statusOverlayMap))

  merged = filterByClients(merged, clientsIdParam)
  merged = filterBySearch(merged, searchParam)
  merged = filterByStatuses(merged, statusParam)
  merged = filterByPublisherIds(merged, publishersIdParam, publisherIdMap)
  merged = filterByBillingTypes(merged, types)

  return merged
}

/**
 * Plan C S2-P5 export surface — hydrate plan_billing_rows behind PLANC_READ_ROWS_EXPORT,
 * then run the same compose pipeline (workbook layout unchanged).
 */
export async function composeBillingRecordsForExportMonth(
  inputs: ComposeBillingMonthInputs
): Promise<BillingRecord[]> {
  await attachPlanRowSchedulesForSurface(inputs.relevantVersions, "export")
  return composeBillingRecordsForMonth(inputs)
}

export type ComposePayablesMonthInputs = {
  year: number
  month: number
  /** Relevant plan versions for THIS month, NOT yet drafts-filtered — filtering happens here. */
  relevantVersions: Record<string, unknown>[]
  publishers: Record<string, unknown>[]
  includeNonBooked: boolean
} & Omit<HubQueryFilterParams, "statusParam">

/** One calendar month of payable records — the payables route's original pipeline verbatim. */
export function composePayableRecordsForMonth(inputs: ComposePayablesMonthInputs): BillingRecord[] {
  const {
    year,
    month,
    relevantVersions,
    publishers,
    includeNonBooked,
    types,
    clientsIdParam,
    searchParam,
    publishersIdParam,
  } = inputs

  const publisherIdMap = buildPublisherIdMap(publishers)
  const versions = filterPlanVersionsByIncludeDrafts(relevantVersions, includeNonBooked)

  let derived = derivePayableRecordsForMonth(versions, year, month)

  derived = filterByClients(derived, clientsIdParam)
  derived = filterBySearch(derived, searchParam)
  derived = filterByPublisherIds(derived, publishersIdParam, publisherIdMap)
  derived = filterByBillingTypes(derived, types)

  return derived
}
