# Domain 5 — Stage 2.0: Schema Discovery & Migration Plan

**Branch:** `localhost` (clean at discovery start)  
**Date:** 2026-05-27  
**Scope:** Read-only discovery. No application or Xano schema changes in this stage.

---

## Receivables Read Path

### `app/api/finance/billing/route.ts` (full)

```typescript
import { NextRequest, NextResponse } from "next/server"
import axios from "axios"
import { xanoUrl } from "@/lib/api/xano"
import {
  parseBillingTypesQueryParam,
  parseSingleBillingMonthParam,
  type FinanceApiErrorBody,
} from "@/lib/finance/billingApiParams"
import { derivePlanReceivableBillingRecordsForMonth, receivableMergeKey } from "@/lib/finance/deriveReceivableRecords"
import { deriveRetainerBillingRecordsForMonth } from "@/lib/finance/deriveRetainerReceivables"
import { deriveSowBillingRecordsFromScopes, type ScopeOfWorkRow } from "@/lib/finance/deriveScopeSowReceivables"
import { fetchRelevantPlanVersionsForFinanceMonth } from "@/lib/finance/relevantPlanVersions"
import { getCachedClients, getCachedPublishers } from "@/lib/finance/xanoReferenceCache"
import type { BillingRecord } from "@/lib/types/financeBilling"
import {
  filterByBillingTypes,
  filterByClients,
  filterByPublisherIds,
  filterBySearch,
  filterByStatuses,
} from "@/lib/finance/filterBillingRecords"
import { financeClientNamesMatch } from "@/lib/finance/utils"

export const maxDuration = 60

export const dynamic = "force-dynamic"
export const revalidate = 0

const XANO_BASE = process.env.XANO_CLIENTS_BASE_URL

/**
 * Read-only receivables for finance billing: rows are derived live from
 * `media_plan_versions.billingSchedule` (media lines + SOW fee lines), `scope_of_work`
 * schedules, and client `monthlyretainer` (synthetic retainer rows). This route does not read or
 * write Xano `finance_billing_records`; persisting edits
 * is intentionally out of scope for this rebuild.
 */

function jsonError(body: FinanceApiErrorBody, status: number) {
  return NextResponse.json(body, { status })
}

function searchParamsRecord(sp: URLSearchParams): Record<string, string> {
  const o: Record<string, string> = {}
  sp.forEach((v, k) => {
    o[k] = v
  })
  return o
}

function clientErrorFromUpstreamBody(data: unknown, upstreamStatus: number): FinanceApiErrorBody {
  if (data && typeof data === "object") {
    const o = data as Record<string, unknown>
    const err = o.error ?? o.message
    if (typeof err === "string" && err.length > 0) {
      return {
        error: err,
        ...(typeof o.field === "string" ? { field: o.field } : {}),
      }
    }
  }
  return { error: `Upstream request failed (${upstreamStatus})` }
}

function buildClientNameMap(clients: Record<string, unknown>[]): Map<string, Record<string, unknown>> {
  const m = new Map<string, Record<string, unknown>>()
  for (const c of clients) {
    const name = String(c.clientname_input ?? c.mp_client_name ?? c.name ?? "").trim()
    if (name) m.set(name, c)
  }
  return m
}

function buildPublisherIdMap(publishers: Record<string, unknown>[]): Map<number, string> {
  const m = new Map<number, string>()
  for (const p of publishers) {
    const id = Number(p.id)
    const name = String(p.publisher_name ?? "").trim()
    if (Number.isFinite(id) && name) m.set(id, name)
  }
  return m
}

export async function GET(request: NextRequest) {
  const requestUrl = request.url
  const query = searchParamsRecord(request.nextUrl.searchParams)

  try {
    if (!XANO_BASE) {
      console.error("[finance-api] billing GET missing env", { requestUrl, query, upstreamBody: null })
      return NextResponse.json({ error: "Missing XANO_CLIENTS_BASE_URL" }, { status: 500 })
    }

    const incoming = request.nextUrl.searchParams
    const billingTypeRaw = incoming.get("billing_type")
    const parsedTypes = parseBillingTypesQueryParam(billingTypeRaw)
    if (!("ok" in parsedTypes && parsedTypes.ok)) {
      return jsonError(parsedTypes as FinanceApiErrorBody, 400)
    }

    const monthParsed = parseSingleBillingMonthParam(incoming.get("billing_month"), { defaultWhenMissing: true })
    if (!("ok" in monthParsed && monthParsed.ok)) {
      return jsonError(monthParsed as FinanceApiErrorBody, 400)
    }
    const monthStr = monthParsed.month

    const includeNonBooked = incoming.get("include_drafts") !== "0"
    const wantMedia = parsedTypes.types.length === 0 || parsedTypes.types.includes("media")
    const wantSow = parsedTypes.types.length === 0 || parsedTypes.types.includes("sow")
    const wantRetainer = parsedTypes.types.length === 0 || parsedTypes.types.includes("retainer")
    const year = Number(monthStr.slice(0, 4))
    const month = Number(monthStr.slice(5, 7))

    let relevantVersions: Record<string, unknown>[] = []
    try {
      const versionsResult = await fetchRelevantPlanVersionsForFinanceMonth(monthStr)
      if ("error" in versionsResult) {
        return NextResponse.json(
          { error: versionsResult.error, field: "billing_month" },
          { status: versionsResult.status }
        )
      }
      // Hydration removed because it caused Vercel FUNCTION_INVOCATION_TIMEOUT by fanning out across 19 Xano line-item endpoints per version.
      relevantVersions = versionsResult.relevantVersions as Record<string, unknown>[]
    } catch (e: unknown) {
      const ax = axios.isAxiosError(e)
      const status =
        ax && e.response?.status != null && e.response.status >= 400 && e.response.status <= 599
          ? e.response.status
          : 502
      const base = ax && e.response?.data != null
        ? clientErrorFromUpstreamBody(e.response.data, status)
        : { error: "Failed to load media plan versions" }
      return NextResponse.json({ ...base, field: "billing_month" }, { status })
    }

    const [clients, publishers] = await Promise.all([getCachedClients(), getCachedPublishers()])
    const clientMap = buildClientNameMap(clients as Record<string, unknown>[])
    const publisherNameMap = new Map<string, unknown>()
    for (const p of publishers as Record<string, unknown>[]) {
      const name = String(p.publisher_name ?? "").trim()
      if (name) publisherNameMap.set(name, p)
    }
    const publisherIdMap = buildPublisherIdMap(publishers as Record<string, unknown>[])

    const derived: BillingRecord[] = []

    if (wantMedia) {
      const fromPlans = derivePlanReceivableBillingRecordsForMonth(
        relevantVersions,
        year,
        month,
        publisherNameMap,
        clientMap,
        { includeNonBookedCampaigns: includeNonBooked }
      )
      derived.push(...fromPlans)
    }

    if (wantSow) {
      try {
        const scopesResponse = await axios.get(xanoUrl("scope_of_work", "XANO_SCOPES_BASE_URL"))
        const scopes: ScopeOfWorkRow[] = Array.isArray(scopesResponse.data) ? scopesResponse.data : []

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
      } catch (e: unknown) {
        console.error("[finance-api] billing scope fetch failed", {
          message: e instanceof Error ? e.message : String(e),
        })
      }
    }

    if (wantRetainer) {
      derived.push(
        ...deriveRetainerBillingRecordsForMonth(clients as Record<string, unknown>[], year, month)
      )
    }

    const byReceivableKey = new Map<string, BillingRecord>()
    for (const rec of derived) {
      const k = receivableMergeKey(rec)
      if (!byReceivableKey.has(k)) byReceivableKey.set(k, rec)
    }
    let merged = [...byReceivableKey.values()].filter((r) => r.billing_month === monthStr)

    const clientsIdParam = incoming.get("clients_id")
    const searchParam = incoming.get("search")
    const statusParam = incoming.get("status")
    const publishersIdParam = incoming.get("publishers_id")

    merged = filterByClients(merged, clientsIdParam)
    merged = filterBySearch(merged, searchParam)
    merged = filterByStatuses(merged, statusParam)
    merged = filterByPublisherIds(merged, publishersIdParam, publisherIdMap)
    merged = filterByBillingTypes(merged, parsedTypes.types)

    return NextResponse.json({ records: merged })
  } catch (error: unknown) {
    console.error("[finance-api] billing GET exception", {
      requestUrl,
      query,
      upstreamBody: null,
      error:
        error instanceof Error
          ? { name: error.name, message: error.message, stack: error.stack }
          : String(error),
    })
    return NextResponse.json({ error: "Failed to fetch billing records" }, { status: 500 })
  }
}
```

### `lib/finance/deriveReceivableRecords.ts` (full)

```typescript
import type { BillingLineItem, BillingRecord } from "@/lib/types/financeBilling"
import {
  buildPlanLineItemMediaDetailLookup,
  compactMediaDetailSlice,
  lookupMediaDetailSlice,
  type PlanLineItemMediaDetailLookup,
} from "@/lib/finance/planLineItemEnrichment"
import {
  extractLineItemsFromBillingSchedule,
  extractServiceAmountsFromBillingSchedule,
  formatInvoiceDate,
  getMediaTypeKeyFromDisplayName,
  mergeFinanceLineItems,
  type FinanceLineItem,
} from "@/lib/finance/utils"

function financeMediaLineToBillingLine(
  li: FinanceLineItem,
  idx: number,
  lookup: PlanLineItemMediaDetailLookup
): BillingLineItem {
  const mediaKey = getMediaTypeKeyFromDisplayName(li.mediaType)
  const slice = lookupMediaDetailSlice(lookup, mediaKey, li.planLineItemId ?? null)
  const extras = slice ? compactMediaDetailSlice(slice) : {}
  return {
    id: 0,
    finance_billing_records_id: 0,
    item_code: li.itemCode,
    line_type: "media",
    media_type: li.mediaType || null,
    description: li.description || null,
    publisher_name: li.publisherName?.trim() || null,
    amount: li.amount,
    client_pays_media: false,
    sort_order: idx,
    ...extras,
  }
}

function hashClientNameToId(name: string): number {
  let h = 5381
  for (let i = 0; i < name.length; i++) {
    h = ((h << 5) + h) ^ name.charCodeAt(i)
  }
  return (Math.abs(h) % 900_000) + 100_000
}

function buildClientResolution(
  version: Record<string, unknown>,
  clientMap: Map<string, unknown>
): { clients_id: number; client_name: string } {
  const numeric =
    Number(version.clients_id ?? version.mp_clients_id ?? version.client_id ?? 0) || 0
  const clientName = String(
    version.mp_client_name ?? version.client_name ?? version.campaign_name ?? "Unknown"
  ).trim()
  if (numeric) return { clients_id: numeric, client_name: clientName || "Unknown" }
  const rec = (clientName ? clientMap.get(clientName) : undefined) as Record<string, unknown> | undefined
  const id = rec?.id != null ? Number(rec.id) || 0 : 0
  if (id !== 0) return { clients_id: id, client_name: clientName || "Unknown" }
  return { clients_id: hashClientNameToId(clientName), client_name: clientName }
}

/**
 * Synthetic receivable rows from `media_plan_versions.billingSchedule` for one calendar month
 * (aligned with `/api/finance/data` extraction).
 */
export function derivePlanReceivableBillingRecordsForMonth(
  relevantVersions: Record<string, unknown>[],
  year: number,
  month: number,
  publisherMap: Map<string, unknown>,
  clientMap: Map<string, unknown>,
  options: { includeNonBookedCampaigns: boolean }
): BillingRecord[] {
  const billingMonth = `${year}-${String(month).padStart(2, "0")}`
  const out: BillingRecord[] = []
  let syntheticId = 1

  for (const version of relevantVersions) {
    const status = String(version.campaign_status ?? "").toLowerCase()
    const bookedLike =
      status === "booked" || status === "approved" || status === "completed"
    if (!bookedLike && !options.includeNonBookedCampaigns) continue

    let billingSchedule: unknown = null
    const raw = version.billingSchedule ?? version.billing_schedule
    if (raw) {
      try {
        billingSchedule = typeof raw === "string" ? JSON.parse(raw as string) : raw
      } catch {
        billingSchedule = null
      }
    }

    const { clients_id, client_name } = buildClientResolution(version, clientMap)
    const mba = String(version.mba_number ?? "").trim()
    const campaign = String(version.campaign_name ?? "").trim() || mba || "Campaign"

    const planLookup = buildPlanLineItemMediaDetailLookup(version as Record<string, unknown>)

    const financeMediaLines = mergeFinanceLineItems(
      extractLineItemsFromBillingSchedule(billingSchedule, year, month, publisherMap as Map<string, any>)
    )
    const serviceAmounts = extractServiceAmountsFromBillingSchedule(billingSchedule, year, month)

    const totalLineItemsAmount = financeMediaLines.reduce((s, li) => s + li.amount, 0)
    const totalServicesAmount =
      serviceAmounts.adservingTechFees + serviceAmounts.production + serviceAmounts.assembledFee
    if (totalLineItemsAmount + totalServicesAmount <= 0) continue

    const clientRow = (client_name ? clientMap.get(client_name) : undefined) as Record<string, unknown> | undefined
    const paymentDays = Number(clientRow?.payment_days) || 30
    const paymentTerms = String(clientRow?.payment_terms ?? "Net 30 days")

    const invoiceDate = formatInvoiceDate(year, month)
    const rawVersionId = version.id
    const media_plan_version_id =
      rawVersionId != null && String(rawVersionId).trim() !== ""
        ? typeof rawVersionId === "string"
          ? parseInt(rawVersionId, 10)
          : Number(rawVersionId)
        : NaN
    const media_plan_version_number = Number(version.version_number)
    const recordStatus: BillingRecord["status"] =
      status === "completed" ? "booked"
      : status === "approved" ? "booked"
      : status === "booked" ? "booked"
      : "draft"

    const mediaLines = financeMediaLines.map((li, i) => financeMediaLineToBillingLine(li, i, planLookup))
    const feeLines: BillingLineItem[] = []
    let order = mediaLines.length
    const pushFee = (item_code: string, description: string, amount: number) => {
      if (amount <= 0) return
      feeLines.push({
        id: 0,
        finance_billing_records_id: 0,
        item_code,
        line_type: "service",
        media_type: null,
        description,
        publisher_name: null,
        amount: Math.round(amount * 100) / 100,
        client_pays_media: false,
        sort_order: order++,
      })
    }

    pushFee("T.Adserving", "Adserving and Tech Fees", serviceAmounts.adservingTechFees)
    pushFee("Production", "Production", serviceAmounts.production)
    pushFee("Service", "Assembled Fee", serviceAmounts.assembledFee)

    const line_items = [...mediaLines, ...feeLines]
    if (line_items.length > 0) {
      const mediaTotal = line_items
        .filter((li) => li.line_type === "media" && li.client_pays_media !== true)
        .reduce((s, li) => s + li.amount, 0)
      const serviceTotal = line_items
        .filter((li) => li.line_type === "service")
        .reduce((s, li) => s + li.amount, 0)
      const total = Math.round((mediaTotal + serviceTotal) * 100) / 100
      out.push({
        id: syntheticId++,
        billing_type: "media",
        clients_id,
        client_name,
        mba_number: mba || null,
        media_plan_version_id: Number.isFinite(media_plan_version_id) ? media_plan_version_id : null,
        media_plan_version_number: Number.isFinite(media_plan_version_number) ? media_plan_version_number : null,
        campaign_name: campaign,
        po_number: version.po_number != null ? String(version.po_number) : null,
        billing_month: billingMonth,
        invoice_date: invoiceDate,
        payment_days: paymentDays,
        payment_terms: paymentTerms,
        status: recordStatus,
        line_items,
        total,
        has_pending_edits: false,
        source_billing_schedule_id: null,
      })
    }
  }

  return out
}

/**
 * Stable merge key: one persisted or synthetic row per client × MBA × billing type.
 * Retainers often share empty MBA; disambiguate with campaign + id when present.
 */
export function receivableMergeKey(r: BillingRecord): string {
  const mba = (r.mba_number ?? "").trim()
  if (r.billing_type === "retainer") {
    const camp = (r.campaign_name ?? "").trim()
    return `${r.clients_id}\u001f${mba}\u001fretainer\u001f${camp}\u001f${r.id}`
  }
  return `${r.clients_id}\u001f${mba}\u001f${r.billing_type}`
}
```

### Flow

| Step | File | Function / handler |
|------|------|-------------------|
| 1 | `app/api/finance/billing/route.ts` | `GET` — entry point |
| 2 | `lib/finance/billingApiParams.ts` | `parseBillingTypesQueryParam`, `parseSingleBillingMonthParam` |
| 3 | `lib/finance/relevantPlanVersions.ts` | `fetchRelevantPlanVersionsForFinanceMonth` — loads `media_plan_master` + `media_plan_versions`, filters latest version per MBA overlapping month |
| 4 | `lib/finance/xanoReferenceCache.ts` | `getCachedClients`, `getCachedPublishers` |
| 5 | `lib/finance/deriveReceivableRecords.ts` | `derivePlanReceivableBillingRecordsForMonth` (media) |
| 6 | `lib/finance/deriveScopeSowReceivables.ts` | `deriveSowBillingRecordsFromScopes` (SOW; Xano `scope_of_work`) |
| 7 | `lib/finance/deriveRetainerReceivables.ts` | `deriveRetainerBillingRecordsForMonth` (client `monthlyretainer`) |
| 8 | `lib/finance/deriveReceivableRecords.ts` | `receivableMergeKey` — dedupe map |
| 9 | `lib/finance/filterBillingRecords.ts` | `filterByClients`, `filterBySearch`, `filterByStatuses`, `filterByPublisherIds`, `filterByBillingTypes` |

**Nested helpers (media derivation only):**

| File | Functions |
|------|-----------|
| `lib/finance/utils.ts` | `extractLineItemsFromBillingSchedule`, `extractServiceAmountsFromBillingSchedule`, `mergeFinanceLineItems`, `formatInvoiceDate`, `buildItemCode`, … |
| `lib/finance/planLineItemEnrichment.ts` | `buildPlanLineItemMediaDetailLookup`, `lookupMediaDetailSlice`, `compactMediaDetailSlice` |
| `lib/finance/deriveReceivableRecords.ts` | `financeMediaLineToBillingLine`, `buildClientResolution`, `hashClientNameToId` |
| `lib/finance/scopeScheduleExtract.ts` | `parseScopeJSON`, `extractLineItemsFromScopeSchedule`, `extractLineItemsFromScopeCost` (SOW path) |

**Response payload shape:**

```json
{
  "records": [ /* BillingRecord[] */ ]
}
```

Each `BillingRecord` matches `lib/types/financeBilling.ts` (see Type Definitions). Query params: `billing_month`, `billing_type`, `clients_id`, `publishers_id`, `include_drafts`, `status`, `search`.

### `BillingRecord` construction sites

| # | File | Function | Lines | `id` assignment |
|---|------|----------|-------|-----------------|
| 1 | `lib/finance/deriveReceivableRecords.ts` | `derivePlanReceivableBillingRecordsForMonth` | 163–182 | **Synthetic:** `id: syntheticId++` starting at 1 per request (in-memory only) |
| 2 | `lib/finance/deriveRetainerReceivables.ts` | `deriveRetainerBillingRecordsForMonth` | 57–74 | **Synthetic:** `id: 0` for all retainer rows |
| 3 | `lib/finance/deriveScopeSowReceivables.ts` | `deriveSowBillingRecordsFromScopes` | 70–87 | **Synthetic:** `id: 0` (implicit default; not set on object — effectively 0) |
| 4 | `lib/finance/normalizeReceivableBillingRecord.ts` | `normalizeReceivableBillingRecord` | 37–60 | **Persisted:** `id: Number(o.id)` from Xano — **not called by current GET billing route** (dead path for hub receivables) |
| 5 | `app/api/finance/publishers/route.ts` | inline types + Xano GET | 74+ | **Persisted** legacy publisher-grouped view (separate route) |

### `BillingRecord.id` rules

| Source | Rule |
|--------|------|
| **Media (plan schedule)** | Monotonic integer `1..N` assigned inside `derivePlanReceivableBillingRecordsForMonth` per API request. Not stable across requests. Not a Xano PK. |
| **SOW** | `0` — no synthetic counter |
| **Retainer** | `0` |
| **Persisted Xano** | Numeric PK from `finance_billing_records.id` when reading legacy tables (`normalizeReceivableBillingRecord`, `/api/finance/publishers`) |
| **Payables** | Always `0` (see Payables section) |

**Merge key** (`receivableMergeKey`): `${clients_id}\u001f${mba}\u001f${billing_type}` except retainer adds `\u001f${campaign}\u001f${id}`. Stage 2 lazy materialisation should align overlay JOIN keys with `(clients_id, mba_number, billing_month)` per Stage 1 — note retainer rows use `mba_number: null` and disambiguate by campaign + synthetic id.

---

## Payables Read Path

### `app/api/finance/payables/route.ts` (full)

```typescript
import { NextRequest, NextResponse } from "next/server"
import axios from "axios"
import {
  parseBillingTypesQueryParam,
  parseSingleBillingMonthParam,
  type FinanceApiErrorBody,
} from "@/lib/finance/billingApiParams"
import { derivePayableRecordsForMonth } from "@/lib/finance/derivePayableRecords"
import {
  filterByBillingTypes,
  filterByClients,
  filterByPublisherIds,
  filterBySearch,
  filterPlanVersionsByIncludeDrafts,
} from "@/lib/finance/filterBillingRecords"
import { fetchRelevantPlanVersionsForFinanceMonth } from "@/lib/finance/relevantPlanVersions"
import { getCachedPublishers } from "@/lib/finance/xanoReferenceCache"
import type { BillingRecord } from "@/lib/types/financeBilling"

export const maxDuration = 60

export const dynamic = "force-dynamic"
export const revalidate = 0

const XANO_BASE = process.env.XANO_CLIENTS_BASE_URL

/**
 * Read-only publisher payables: rows are derived live from `media_plan_versions.deliverySchedule`
 * (and `delivery_schedule`). This route does not read or write Xano `finance_billing_records`.
 * Client + publisher + MBA grouping matches the legacy `/finance/publishers` view and is performed
 * inside `derivePayableRecordsForMonth`.
 */

function jsonError(body: FinanceApiErrorBody, status: number) {
  return NextResponse.json(body, { status })
}

function searchParamsRecord(sp: URLSearchParams): Record<string, string> {
  const o: Record<string, string> = {}
  sp.forEach((v, k) => {
    o[k] = v
  })
  return o
}

function clientErrorFromUpstreamBody(data: unknown, upstreamStatus: number): FinanceApiErrorBody {
  if (data && typeof data === "object") {
    const o = data as Record<string, unknown>
    const err = o.error ?? o.message
    if (typeof err === "string" && err.length > 0) {
      return {
        error: err,
        ...(typeof o.field === "string" ? { field: o.field } : {}),
      }
    }
  }
  return { error: `Upstream request failed (${upstreamStatus})` }
}

function buildPublisherIdMap(publishers: Record<string, unknown>[]): Map<number, string> {
  const m = new Map<number, string>()
  for (const p of publishers) {
    const id = Number(p.id)
    const name = String(p.publisher_name ?? "").trim()
    if (Number.isFinite(id) && name) m.set(id, name)
  }
  return m
}

export async function GET(request: NextRequest) {
  const requestUrl = request.url
  const query = searchParamsRecord(request.nextUrl.searchParams)

  try {
    if (!XANO_BASE) {
      console.error("[finance-api] payables GET missing env", { requestUrl, query, upstreamBody: null })
      return NextResponse.json({ error: "Missing XANO_CLIENTS_BASE_URL" }, { status: 500 })
    }

    const searchParams = request.nextUrl.searchParams
    const billingTypeRaw = searchParams.get("billing_type")
    const parsedTypes = parseBillingTypesQueryParam(billingTypeRaw)
    if (!("ok" in parsedTypes && parsedTypes.ok)) {
      return jsonError(parsedTypes as FinanceApiErrorBody, 400)
    }

    const billingMonthParam = searchParams.get("billing_month")
    const monthParsed = parseSingleBillingMonthParam(billingMonthParam, { defaultWhenMissing: true })
    if (!("ok" in monthParsed && monthParsed.ok)) {
      return jsonError(monthParsed as FinanceApiErrorBody, 400)
    }
    const monthStr = monthParsed.month

    const includeNonBooked = searchParams.get("include_drafts") !== "0"

    let year: number
    let month: number
    let relevantVersions: Record<string, unknown>[]

    try {
      const versionsResult = await fetchRelevantPlanVersionsForFinanceMonth(monthStr)
      if ("error" in versionsResult) {
        return NextResponse.json(
          { error: versionsResult.error, field: "billing_month" },
          { status: versionsResult.status }
        )
      }
      year = versionsResult.year
      month = versionsResult.month
      relevantVersions = filterPlanVersionsByIncludeDrafts(
        versionsResult.relevantVersions as Record<string, unknown>[],
        includeNonBooked
      )
    } catch (e: unknown) {
      const ax = axios.isAxiosError(e)
      const status =
        ax && e.response?.status != null && e.response.status >= 400 && e.response.status <= 599
          ? e.response.status
          : 502
      const base =
        ax && e.response?.data != null
          ? clientErrorFromUpstreamBody(e.response.data, status)
          : { error: "Failed to load media plan versions" }
      return NextResponse.json({ ...base, field: "billing_month" }, { status })
    }

    const publishers = (await getCachedPublishers()) as Record<string, unknown>[]
    const publisherIdMap = buildPublisherIdMap(publishers)

    let derived = derivePayableRecordsForMonth(relevantVersions, year, month)

    const clientsIdParam = searchParams.get("clients_id")
    const searchParam = searchParams.get("search")
    const publishersIdParam = searchParams.get("publishers_id")

    derived = filterByClients(derived, clientsIdParam)
    derived = filterBySearch(derived, searchParam)
    derived = filterByPublisherIds(derived, publishersIdParam, publisherIdMap)
    derived = filterByBillingTypes(derived, parsedTypes.types)

    return NextResponse.json({ records: derived })
  } catch (error: unknown) {
    console.error("[finance-api] payables GET exception", {
      requestUrl,
      query,
      upstreamBody: axios.isAxiosError(error) ? error.response?.data ?? null : null,
      error:
        error instanceof Error
          ? { name: error.name, message: error.message, stack: error.stack }
          : String(error),
    })
    return NextResponse.json({ error: "Failed to build payables" }, { status: 500 })
  }
}
```

### `lib/finance/derivePayableRecords.ts` (full)

```typescript
import type { BillingLineItem, BillingRecord } from "@/lib/types/financeBilling"
import {
  extractPayablesFromDeliverySchedule,
  type PayableDeliveryExtract,
} from "@/lib/finance/payablesReport"

const U = "\u001f"

export type PayablePlanVersionInput = {
  id?: unknown
  deliverySchedule?: unknown
  delivery_schedule?: unknown
  mba_number?: unknown
  campaign_name?: unknown
  mp_campaignname?: unknown
  mp_client_name?: unknown
  client_name?: unknown
  clients_id?: unknown
  mp_clients_id?: unknown
  client_id?: unknown
}

function coalesceDeliveryJson(raw: unknown): unknown {
  if (raw === null || raw === undefined) return null
  if (typeof raw === "string") {
    const t = raw.trim()
    if (!t) return null
    try {
      return JSON.parse(t) as unknown
    } catch {
      return null
    }
  }
  return raw
}

type EnrichedLine = PayableDeliveryExtract & { clientName: string }

function agencyOwedTotal(rows: EnrichedLine[]): number {
  return (
    Math.round(
      rows.filter((r) => !r.clientPaysForMedia).reduce((s, r) => s + r.amount, 0) * 100
    ) / 100
  )
}

/**
 * Build synthetic `BillingRecord` rows (`billing_type: "payable"`) for the finance hub.
 *
 * **Source of truth:** `media_plan_versions.deliverySchedule` / `delivery_schedule` only.
 * Receivables use `billingSchedule`; payables (publisher / delivery view) must not read
 * `billingSchedule` here — that would mix client billing with agency delivery.
 *
 * Groups by `clientId + publisherName + mbaNumber` so unrelated campaigns do not merge.
 */
export function derivePayableRecordsForMonth(
  versions: PayablePlanVersionInput[],
  year: number,
  month: number
): BillingRecord[] {
  const billingMonth = `${year}-${String(month).padStart(2, "0")}`
  const lines: EnrichedLine[] = []

  for (const version of versions) {
    // Payables: delivery JSON only (never billingSchedule / billing_schedule).
    const ds = coalesceDeliveryJson(version.deliverySchedule ?? version.delivery_schedule)
    if (!ds) continue

    const mba = String(version.mba_number ?? "").trim()
    const campaign =
      String(version.campaign_name ?? version.mp_campaignname ?? "").trim() || mba || "Campaign"
    const clientId =
      Number(version.clients_id ?? version.mp_clients_id ?? version.client_id ?? 0) || 0
    const clientName = String(version.mp_client_name ?? version.client_name ?? "Unknown client").trim()

    const extracted = extractPayablesFromDeliverySchedule(ds, year, month, {
      mbaNumber: mba,
      clientId,
      campaignName: campaign,
    })

    for (const e of extracted) {
      lines.push({ ...e, clientName })
    }
  }

  const groupMap = new Map<string, EnrichedLine[]>()
  for (const line of lines) {
    const k = `${line.clientId}${U}${line.publisherName}${U}${line.mbaNumber}`
    if (!groupMap.has(k)) groupMap.set(k, [])
    groupMap.get(k)!.push(line)
  }

  const records: BillingRecord[] = []

  for (const [, rows] of groupMap) {
    if (rows.length === 0) continue
    const first = rows[0]!
    const total = agencyOwedTotal(rows)

    const line_items: BillingLineItem[] = rows.map((r, i) => {
      const mt = (r.mediaType || "MEDIA").toString().replace(/\s+/g, "").slice(0, 24)
      return {
        id: 0,
        finance_billing_records_id: 0,
        item_code: `PAY.${mt || "MEDIA"}`,
        line_type: "media",
        media_type: r.mediaType || null,
        description: r.description || r.campaignName || r.mediaType || null,
        publisher_name: r.publisherName,
        amount: r.amount,
        client_pays_media: r.clientPaysForMedia === true,
        sort_order: i,
      }
    })

    records.push({
      id: 0,
      billing_type: "payable",
      clients_id: first.clientId,
      client_name: first.clientName,
      mba_number: first.mbaNumber || null,
      campaign_name: first.campaignName || null,
      po_number: null,
      billing_month: billingMonth,
      invoice_date: null,
      payment_days: 0,
      payment_terms: "Net 30",
      status: "expected",
      line_items,
      total,
      has_pending_edits: false,
      // Payables come from deliverySchedule on the version, not billing schedule rows.
      source_billing_schedule_id: null,
    })
  }

  records.sort((a, b) => {
    const ca = `${a.client_name}|${a.mba_number}|${a.line_items[0]?.publisher_name ?? ""}`
    const cb = `${b.client_name}|${b.mba_number}|${b.line_items[0]?.publisher_name ?? ""}`
    return ca.localeCompare(cb, undefined, { sensitivity: "base" })
  })

  return records
}
```

### Flow

| Step | File | Function |
|------|------|----------|
| 1 | `app/api/finance/payables/route.ts` | `GET` |
| 2 | `lib/finance/billingApiParams.ts` | param parsing |
| 3 | `lib/finance/relevantPlanVersions.ts` | `fetchRelevantPlanVersionsForFinanceMonth` |
| 4 | `lib/finance/filterBillingRecords.ts` | `filterPlanVersionsByIncludeDrafts` |
| 5 | `lib/finance/derivePayableRecords.ts` | `derivePayableRecordsForMonth` |
| 6 | `lib/finance/payablesReport.ts` | `extractPayablesFromDeliverySchedule` |
| 7 | `lib/finance/filterBillingRecords.ts` | client/search/publisher/type filters |

**Response:** `{ records: BillingRecord[] }` with `billing_type: "payable"`, `status: "expected"`, `invoice_date: null`, `id: 0`.

### `BillingRecord` construction (payables)

| File | Function | Lines | `id` |
|------|----------|-------|------|
| `lib/finance/derivePayableRecords.ts` | `derivePayableRecordsForMonth` | 117–135 | **Synthetic:** `id: 0` for every grouped payable record |

**Grouping key:** `${clientId}\u001f${publisherName}\u001f${mbaNumber}` (one record per client × publisher × MBA per month).

**Line items:** `item_code: PAY.{mediaType}` — does **not** persist schedule `lineItemId` on `BillingLineItem` today.

---

## Schedule Write Paths

### `git grep -nE "billingSchedule|deliverySchedule" -- app/api/` (full output)

```
app/api/campaigns/[mba_number]/billing-schedule/route.ts:57:    let billingSchedule: any = null
app/api/campaigns/[mba_number]/billing-schedule/route.ts:58:    if (versionData.billingSchedule) {
app/api/campaigns/[mba_number]/billing-schedule/route.ts:60:        billingSchedule = typeof versionData.billingSchedule === "string"
app/api/campaigns/[mba_number]/billing-schedule/route.ts:61:          ? JSON.parse(versionData.billingSchedule)
app/api/campaigns/[mba_number]/billing-schedule/route.ts:62:          : versionData.billingSchedule
app/api/campaigns/[mba_number]/billing-schedule/route.ts:72:    if (!billingSchedule || !Array.isArray(billingSchedule) || billingSchedule.length === 0) {
app/api/campaigns/[mba_number]/billing-schedule/route.ts:86:      billingSchedule: billingSchedule
app/api/campaigns/[mba_number]/route.ts:92:  billingSchedule: any,
... (read-only uses in campaigns route) ...
app/api/finance/accrual/route.ts:40:  deliverySchedule?: unknown
app/api/finance/accrual/route.ts:42:  billingSchedule?: unknown
app/api/finance/accrual/route.ts:250:        const partial = collectClientPaysForMediaFlagsFromSchedule(v.deliverySchedule ?? v.delivery_schedule)
app/api/finance/accrual/route.ts:271:        deliverySchedule: v.deliverySchedule ?? v.delivery_schedule ?? null,
app/api/finance/accrual/route.ts:272:        billingSchedule: v.billingSchedule ?? v.billing_schedule ?? null,
app/api/finance/billing/route.ts:33: * `media_plan_versions.billingSchedule` ...
app/api/finance/data/route.ts:74-99: (read-only extraction)
app/api/finance/payables/route.ts:28: * ... deliverySchedule` (read-only)
app/api/finance/publishers/route.ts:3: * ... deliverySchedule` (comment)
app/api/finance/sow/route.ts:22,73-74: (read scope billingSchedule)
app/api/mba/generate/route.ts:47: billingSchedule in PDF payload only (not persisted)
app/api/mediaplans/[id]/route.ts:270-311: PUT creates new version with schedules
app/api/mediaplans/mba/[mba_number]/route.ts: (GET read/filter; PUT writes both schedules)
app/api/mediaplans/versions/[id]/billing-schedule/route.ts:29-40: PATCH billingSchedule
```

**Only one route PATCHes schedule JSON in place.** All other writes create a **new** `media_plan_versions` row (POST) with `billingSchedule` + `deliverySchedule`.

### Route handlers that **mutate** schedule fields

| File | HTTP | Route | UI / trigger | Request body (schedule-related) | Xano target | Merge / pass-through |
|------|------|-------|--------------|--------------------------------|-------------|----------------------|
| `app/api/mediaplans/versions/[id]/billing-schedule/route.ts` | **PATCH** | `/api/mediaplans/versions/{id}/billing-schedule` | Finance hub **Alter Billing** (`FinanceHubPageClient` → `AlterBillingDialog`) | `{ billingSchedule: BillingScheduleEntry[] }` from `buildBillingScheduleJSON(months)` | `PATCH {MEDIA_PLANS_BASE}/media_plan_versions/{id}` body `{ billingSchedule }` only | **Pass-through**; calls `clearRelevantPlanVersionsCache()` after success |
| `app/api/mediaplans/mba/[mba_number]/route.ts` | **PUT** | `/api/mediaplans/mba/{mba_number}` | MBA **edit** page save (`edit/page.tsx` ~5017) | Full version payload incl. `billingSchedule`, `deliverySchedule`, `delivery_schedule`, bursts, form fields | `POST {MEDIA_PLANS_BASE}/media_plan_versions` (new version) + `PATCH media_plan_master/{id}` | **New version** — increments `version_number`; schedules embedded in POST body |
| `app/api/mediaplans/[id]/route.ts` | **PUT** | `/api/mediaplans/{id}` | Alternate version-creation flow (by version id) | `billingSchedule`, `deliverySchedule` parsed via `parseSchedule` | `POST media_plan_versions` | **New version** (copies master linkage) |
| `lib/api.ts` | **POST** (browser → Xano) | `{MEDIA_PLANS_BASE}/media_plan_versions` | **Create** campaign page (`create/page.tsx` → `createMediaPlanVersion`) | `billingSchedule`, `deliverySchedule`, `delivery_schedule` on payload | Direct Xano from client when `isBrowser` | **Bypasses Next API** — no server-side hook for `finance_edits` unless create is proxied in 2.2 |
| `app/api/mediaplans/mba/[mba_number]/route.ts` | **PATCH** | `/api/mediaplans/mba/{mba_number}` | Master metadata updates | Does **not** include schedule fields in typical master patch | `PATCH media_plan_master/{id}` | Master only |

**Read-only** references (no mutation): `app/api/finance/*`, `app/api/campaigns/*` GET paths, `app/api/mba/generate` (PDF only).

### `app/api/mediaplans/versions/[id]/billing-schedule/route.ts` (full)

```typescript
import { NextResponse } from "next/server"
import axios from "axios"
import { getXanoBaseUrl } from "@/lib/api/xano"
import { clearRelevantPlanVersionsCache } from "@/lib/finance/relevantPlanVersions"

const MEDIA_PLANS_ENV_KEYS = ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"] as const

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!id) {
      return NextResponse.json({ error: "Missing version id" }, { status: 400 })
    }

    let mediaPlansBaseUrl: string
    try {
      mediaPlansBaseUrl = getXanoBaseUrl([...MEDIA_PLANS_ENV_KEYS])
    } catch {
      return NextResponse.json(
        { error: "XANO_MEDIA_PLANS_BASE_URL (or XANO_MEDIAPLANS_BASE_URL) is not configured" },
        { status: 500 }
      )
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== "object" || !("billingSchedule" in body)) {
      return NextResponse.json(
        { error: "Request body must include billingSchedule" },
        { status: 400 }
      )
    }

    const { billingSchedule } = body as { billingSchedule: unknown }

    const xanoResponse = await axios.patch(
      `${mediaPlansBaseUrl}/media_plan_versions/${encodeURIComponent(id)}`,
      { billingSchedule }
    )

    clearRelevantPlanVersionsCache()

    return NextResponse.json({ ok: true, data: xanoResponse.data })
  } catch (error) {
    const message =
      (error as { response?: { data?: { message?: string } }; message?: string })?.response?.data
        ?.message ||
      (error as { message?: string })?.message ||
      "Failed to patch billing schedule"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
```

**Confirmed:** `media_plan_versions` is PATCHed **in place** for Alter Billing only. There is **no** dedicated `delivery-schedule` PATCH route; delivery JSON changes only via **new version** POST.

### Alter Billing save path (end-to-end)

1. **UI:** `app/finance/FinanceHubPageClient.tsx` — Client Billing tab opens `AlterBillingDialog` with `initialMonths` loaded from MBA GET (`/api/mediaplans/mba/{mba}?billingScheduleFull=1`).
2. **Component:** `components/billing/AlterBillingDialog.tsx` — user edits amounts; `onSave(months)` after grand-total tolerance check.
3. **Client fetch:** `PATCH /api/mediaplans/versions/${versionId}/billing-schedule` with `JSON.stringify({ billingSchedule: buildBillingScheduleJSON(newMonths) })`.
4. **API route:** `app/api/mediaplans/versions/[id]/billing-schedule/route.ts` → `axios.patch(.../media_plan_versions/{id}, { billingSchedule })`.
5. **Cache:** `clearRelevantPlanVersionsCache()` (30s TTL cache in `relevantPlanVersions.ts`).
6. **UI refresh:** `bumpReceivablesFetch()` → refetch `/api/finance/billing`.

No `lib/finance/api.ts` helper — raw `fetch` in hub client.

### MBA edit page billing schedule save (end-to-end)

1. **UI:** `app/mediaplans/mba/[mba_number]/edit/page.tsx` — `workingBillingMonths` / `buildBillingScheduleForSave()` / `buildDeliveryScheduleForSave()`.
2. **Client fetch:** `PUT /api/mediaplans/mba/${mbaNumber}` with body including `billingSchedule`, `deliverySchedule`, `delivery_schedule`, media bursts, form values (~5017–5032).
3. **API:** `app/api/mediaplans/mba/[mba_number]/route.ts` `PUT` → computes `nextVersionNumber` → **`POST media_plan_versions`** with full `newVersionData` (schedules + flags) → **`PATCH media_plan_master`** for version pointer/metadata.
4. **Does not** PATCH existing version row — always appends a new version.

Uses `buildBillingScheduleJSON` from `lib/billing/buildBillingSchedule.ts` (maps `BillingMonth.lineItems[].id` → JSON `lineItemId`).

---

## Current Status Write Paths

### `app/api/finance/billing/[id]/route.ts` (full)

```typescript
import { NextRequest, NextResponse } from "next/server"
import { FINANCE_BILLING_RECORDS_PATH, xanoFinancePatch } from "@/lib/finance/xanoFinanceApi"

export const maxDuration = 60

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const body = (await request.json()) as Record<string, unknown>
    const payload = await xanoFinancePatch(`${FINANCE_BILLING_RECORDS_PATH}/${id}`, body)
    return NextResponse.json(payload)
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to update billing record", details: error?.message || String(error) },
      { status: 500 }
    )
  }
}
```

| Aspect | Detail |
|--------|--------|
| **PATCHable fields** | Any JSON body — **pass-through** to Xano (no server-side allowlist). TS client uses `Partial<BillingRecord>` (`status`, `po_number`, `invoice_date`, `total`, `line_items`, …). |
| **Role gating** | **None** in route. `middleware.ts` requires authenticated session for `/api/*` (401 if missing). No finance-admin role check (unlike `accrual` / `forecast` which block `client` role). |
| **Xano** | `PATCH {XANO_CLIENTS_BASE_URL}/finance_billing_records/{id}` |

### `app/api/finance/edits/route.ts` (full)

```typescript
import { NextRequest, NextResponse } from "next/server"
import {
  FINANCE_EDITS_PATH,
  parseList,
  xanoFinanceGet,
  xanoFinancePost,
} from "@/lib/finance/xanoFinanceApi"

export const maxDuration = 60

export async function GET(request: NextRequest) {
  try {
    const recordId = request.nextUrl.searchParams.get("finance_billing_records_id")
    const data = await xanoFinanceGet(FINANCE_EDITS_PATH)
    const rows = parseList(data)
    const filtered = recordId
      ? rows.filter((row: any) => String(row.finance_billing_records_id) === String(recordId))
      : rows
    return NextResponse.json(filtered)
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to fetch finance edits", details: error?.message || String(error) },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>
    const payload = await xanoFinancePost(FINANCE_EDITS_PATH, body)
    return NextResponse.json(payload, { status: 201 })
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to create finance edit", details: error?.message || String(error) },
      { status: 500 }
    )
  }
}
```

### `app/api/finance/edits/publish/route.ts` (full)

```typescript
import { NextRequest, NextResponse } from "next/server"
import { FINANCE_EDITS_PUBLISH_PATH, xanoFinancePost } from "@/lib/finance/xanoFinanceApi"

export const maxDuration = 60

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>
    const payload = await xanoFinancePost(FINANCE_EDITS_PUBLISH_PATH, body)
    return NextResponse.json(payload)
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to publish finance edits", details: error?.message || String(error) },
      { status: 500 }
    )
  }
}
```

**Existing write contract:**

| Endpoint | Method | Body | Xano |
|----------|--------|------|------|
| `/api/finance/edits` | GET | Query `finance_billing_records_id` optional | GET `finance_edits` (filter in Node) |
| `/api/finance/edits` | POST | Arbitrary JSON (pass-through) | POST `finance_edits` |
| `/api/finance/edits/publish` | POST | Arbitrary JSON; grid uses `{}` | POST `finance_edits/publish` |
| `/api/finance/billing/line-items` | POST | Line item fields + `finance_billing_records_id` | POST `finance_billing_line_items` |
| `/api/finance/billing/line-items/[id]` | PATCH/DELETE | Pass-through | PATCH/DELETE `finance_billing_line_items/{id}` |

`BillingEdit` TS type does **not** include `record_type`; accrual uses extra field on POST only.

### `lib/finance/api.ts` — callers of billing/edits routes

| Function | Signature | Callers (production) |
|----------|-----------|------------------------|
| `updateBillingRecord` | `(id: number, data: Partial<BillingRecord>) => Promise<BillingRecord>` | `components/finance/tabs/ReceivablesTab.tsx`, `PayablesTab.tsx` — **tabs not mounted** by current `FinanceHubPageClient`; `EditableFinanceGrid` uses store only unless `onCellEdit` wired |
| `publishEdits` | `(recordId: number) => Promise<void>` | **No callers** (dead export) |
| `fetchEditHistory` | `(recordId: number) => Promise<BillingEdit[]>` | **No callers** |
| `postAccrualReconcileEdit` | `({ clients_id, month, reconciled }) => Promise<void>` | `components/finance/tabs/AccrualTab.tsx` |
| `fetchFinanceEditsList` | `() => Promise<unknown[]>` | `AccrualTab`, `OverviewTab`, `FinanceHubPageClient`, `useFinanceStore` |
| `updateLineItem` / `addLineItem` / `deleteLineItem` | line item CRUD | `ReceivablesTab.tsx` only |

`EditableFinanceGrid` calls `fetch("/api/finance/edits/publish", { body: "{}" })` directly — not `publishEdits()`.

### Accrual reconcile write (`postAccrualReconcileEdit`)

```typescript
/** Persist accrual reconciliation via `finance_edits` (`record_type: accrual_reconcile`). */
export async function postAccrualReconcileEdit(params: {
  clients_id: number
  month: string
  reconciled: boolean
}): Promise<void> {
  const response = await fetch("/api/finance/edits", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      record_type: "accrual_reconcile",
      edit_type: "field_change",
      field_name: `accrual:${params.clients_id}:${params.month}`,
      new_value: params.reconciled ? "1" : "0",
      old_value: null,
      edit_status: "published",
      finance_billing_records_id: null,
      finance_billing_line_items_id: null,
    }),
  })
  ...
}
```

Read path: `lib/finance/computeAccrual.ts` → `parseAccrualReconcilesFromEdits` filters `record_type === "accrual_reconcile"`.

---

## Type Definitions

### `lib/types/financeBilling.ts` — `BillingRecord`, `BillingLineItem`, `BillingStatus`, `BillingEdit`

```typescript
/** `payable` = publisher/delivery view from `media_plan_versions.deliverySchedule`, not `billingSchedule`. */
export type BillingType = "media" | "sow" | "retainer" | "payable"

export type BillingStatus =
  | "draft"
  | "booked"
  | "approved"
  | "invoiced"
  | "paid"
  | "cancelled"
  | "expected"
  | "disputed"

export interface BillingLineItem {
  id: number
  finance_billing_records_id: number
  item_code: string
  line_type: "media" | "service" | "fee" | "retainer"
  media_type: string | null
  description: string | null
  publisher_name: string | null
  amount: number
  client_pays_media: boolean
  sort_order: number
  network?: string | null
  platform?: string | null
  placement?: string | null
  market?: string | null
  title?: string | null
  ad_size?: string | null
  site?: string | null
  station?: string | null
  format?: string | null
  bid_strategy?: string | null
  creative?: string | null
}

export interface BillingRecord {
  id: number
  billing_type: BillingType
  clients_id: number
  client_name: string
  mba_number: string | null
  media_plan_version_id?: number | null
  media_plan_version_number?: number | null
  campaign_name: string | null
  po_number: string | null
  billing_month: string
  invoice_date: string | null
  payment_days: number
  payment_terms: string
  status: BillingStatus
  line_items: BillingLineItem[]
  total: number
  has_pending_edits: boolean
  source_billing_schedule_id: number | null
  finance_accrual?: FinanceAccrualBreakdown | null
}

export interface BillingEdit {
  id: number
  finance_billing_records_id: number
  finance_billing_line_items_id: number | null
  edit_type: "field_change" | "amount_change" | "status_change" | "line_add" | "line_remove"
  field_name: string
  old_value: string | null
  new_value: string | null
  edit_status: "draft" | "published" | "reverted"
  edited_by: number
  edited_by_name: string
  published_at: string | null
  created_at: string
}
```

There is **no** `FinanceEditRow` type — `BillingEdit` is the edit-row contract. Extend `BillingEdit` (or add `FinanceEditRow`) for `record_type` and schedule-audit fields in 2.2.

### Schedule month / line shape (`lib/billing/types.ts` + `lib/billing/buildBillingSchedule.ts`)

Editor grid (`BillingMonth`, `BillingLineItem` with `id: string`) — see `lib/billing/types.ts` lines 21–114.

Persisted JSON (`buildBillingScheduleJSON` output):

```typescript
export type BillingScheduleEntry = {
  monthYear: string
  mediaTypes: Array<{
    mediaType: string
    lineItems: Array<{
      lineItemId: string   // from BillingLineItem.id
      header1: string
      header2: string
      amount: string       // "$1,234.56"
      clientPaysForMedia?: boolean  // delivery schedule only
    }>
  }>
  adservingTechFees?: string
  production: string
  feeTotal: string
}
```

Derivation read shape (`lib/finance/utils.ts` `BillingScheduleEntry` / `FinanceLineItem`):

- Reads `lineItemId` / `line_item_id` → `FinanceLineItem.planLineItemId`
- Does **not** map `planLineItemId` onto `BillingLineItem` in derived rows (only `item_code` from `buildItemCode`)

### Types to extend in Stage 2.2

| Type | File | Current | Fields to add (Stage 2) |
|------|------|---------|-------------------------|
| `BillingRecord` | `lib/types/financeBilling.ts` | see above | `billed?`, `billed_at?`, `billed_by?`, `notes?`, `exported_at?`, `exported_by?`; optional `persisted_id?` separate from synthetic `id` |
| `BillingLineItem` | same | see above | `line_status?`, `received_at?`, `received_amount?`, `note?`, `orphaned?`, `line_item_id?` (schedule key), `media_plan_version_number?` |
| `BillingEdit` | same | see above | `record_type?`, maybe `clients_id?`, `mba_number?`, `billing_month?` for schedule audits |
| `BillingStatus` | same | workflow enum | May split invoice (`billed`) from campaign `status`; or keep `status` for campaign + add `billed` boolean per D1 |
| `FinanceLineItem` | `lib/finance/utils.ts` | includes `planLineItemId` | Ensure payables derivation carries `planLineItemId` through to overlay |

---

## Xano Tables Referenced

Base URLs: finance tables use `XANO_CLIENTS_BASE_URL` via `xanoUrl` / `xanoFinance*`. Media plans use `XANO_MEDIA_PLANS_BASE_URL` or `XANO_MEDIAPLANS_BASE_URL`.

| Table / path | HTTP | Calling files |
|--------------|------|---------------|
| `media_plan_master` | GET | `relevantPlanVersions.ts`, `accrual/route.ts`, `forecast/loadFinanceForecastDataset.ts`, `mediaplans/route.ts`, `mba/[mba_number]/route.ts` |
| `media_plan_versions` | GET, POST, PATCH | `relevantPlanVersions.ts`, `billing-schedule/route.ts`, `mba/[mba_number]/route.ts` (GET/PUT), `mediaplans/[id]/route.ts`, `accrual/route.ts`, `forecast/*`, `lib/api.ts` (browser POST) |
| `scope_of_work` | GET | `billing/route.ts`, `finance/sow/route.ts`, `deriveScopeSowReceivables` |
| `get_clients` | GET | `xanoReferenceCache.ts`, `finance/data/route.ts`, `forecast/*` |
| `get_publishers` | GET | `xanoReferenceCache.ts`, `forecast/*` |
| `finance_billing_records` | GET, PATCH | `publishers/route.ts` (GET), `billing/[id]/route.ts` (PATCH) — **not** receivables GET |
| `finance_billing_line_items` | POST, PATCH, DELETE | `billing/line-items/route.ts`, `billing/line-items/[id]/route.ts` — **never read** by hub derive routes |
| `finance_edits` | GET, POST | `edits/route.ts`, accrual consumers |
| `finance_edits/publish` | POST | `edits/publish/route.ts` |
| `finance_saved_views` | GET, POST | `saved-views/route.ts` |
| 19× media line item tables | GET | `hydratePlanVersionsForBillingLineEnrichment.ts`, `mediaplans/[id]/route.ts` (disabled for billing GET) |

### Confirmations

| Question | Answer |
|----------|--------|
| `media_plan_versions` PATCH for schedule? | **Yes** — only `{ billingSchedule }` via `/api/mediaplans/versions/[id]/billing-schedule`. **No** in-place PATCH for `deliverySchedule`. |
| `finance_billing_line_items` in code? | **Write-only** API proxies; table **not read** for payables/receivables derivation. Stage 1 ground truth (empty in Xano) matches code. |
| Undocumented finance tables? | `finance_saved_views`; forecast snapshot tables (`XANO_FINANCE_FORECAST_SNAPSHOTS_*`) — out of Stage 2 status scope but share finance area |

---

## Proposed Migration Plan

### 7.1 Xano column additions

**Note:** Supplied Xano UI interfaces (Luke 2026-05-27) are referenced in `FINANCE-UX-REDESIGN.md` but **not committed** to this repo. Below: **existing** = used in TS/API today; **new** = Stage 1 Decision 1, absent from codebase.

#### `finance_billing_records`

| Column | Type | Nullable / default | Index? | Status |
|--------|------|-------------------|--------|--------|
| `id` | integer | PK | PK | **existing** |
| `billing_type` | enum/text | | | **existing** (TS) |
| `clients_id` | integer | | yes — JOIN | **existing** |
| `client_name` | text | | | **existing** |
| `mba_number` | text | nullable | yes — composite `(clients_id, mba_number, billing_month)` | **existing** |
| `campaign_name` | text | nullable | | **existing** |
| `po_number` | text | nullable | | **existing** |
| `billing_month` | text | | yes | **existing** |
| `invoice_date` | date/text | nullable | | **existing** |
| `payment_days` | integer | | | **existing** |
| `payment_terms` | text | | | **existing** |
| `status` | enum | | | **existing** |
| `total` | numeric | | | **existing** |
| `has_pending_edits` | boolean | | | **existing** |
| `source_billing_schedule_id` | integer | nullable | | **existing** |
| `billed` | boolean | default `false` | filter KPIs | **new** |
| `billed_at` | timestamp | nullable | | **new** |
| `billed_by` | integer FK users | nullable | | **new** |
| `notes` | text | nullable | | **new** |
| `exported_at` | timestamp | nullable | | **new** |
| `exported_by` | integer FK users | nullable | | **new** |

#### `finance_billing_line_items`

| Column | Type | Nullable / default | Index? | Status |
|--------|------|-------------------|--------|--------|
| `id` | integer | PK | PK | **existing** |
| `finance_billing_record` or `finance_billing_records_id` | integer FK | | yes | **existing** (TS uses `finance_billing_records_id`; confirm Xano column name in UI) |
| `item_code` | text | | | **existing** — **not** equal to schedule `lineItemId` (derived codes like `T.Adserving`, `PAY.SEARCH`) |
| `line_type` | enum | | | **existing** |
| `media_type` | text | nullable | | **existing** |
| `description` | text | nullable | | **existing** |
| `publisher_name` | text | nullable | | **existing** |
| `amount` | numeric | | | **existing** |
| `client_pays_media` | boolean | | | **existing** |
| `sort_order` | integer | | | **existing** |
| `line_item_id` | text | nullable | | **new (recommended)** — store schedule `lineItemId` for orphan matching; `item_code` alone is insufficient |
| `line_status` | enum received/disputed/variance | nullable | | **new** |
| `received_at` | timestamp | nullable | | **new** |
| `received_amount` | numeric | nullable | | **new** |
| `note` | text | nullable | | **new** |
| `orphaned` | boolean | default `false` | | **new** |
| `media_plan_version_number` | integer | nullable | | **new** |

**Uniqueness for lazy line rows:** Recommend unique constraint on `(finance_billing_record_id, line_item_id)` where `line_item_id IS NOT NULL`. Payable grouping may need `(record_id, line_item_id)` or `(clients_id, mba_number, billing_month, publisher_name, line_item_id)` depending on whether line items attach to invoice-grain parent records only.

**`lineItemId` mapping:** Schedule JSON uses `lineItemId` (from `BillingLineItem.id` in editor). Derived `BillingLineItem.item_code` is a **billing code** (`buildItemCode`), not the stable schedule key. Stage 2.2 should add `line_item_id` column and populate on materialisation.

#### `finance_edits`

Likely **existing** columns per `BillingEdit` TS. **new** / confirm in Xano UI:

- `record_type` (text/enum) — already used in POST for `accrual_reconcile` but not in TS interface

### 7.2 Read path changes (Stage 2.2)

| File | Change |
|------|--------|
| `lib/finance/xanoFinanceApi.ts` | Add batch GET helpers for `finance_billing_records` + `finance_billing_line_items` by month/MBA keys |
| New: `lib/finance/overlayFinanceStatus.ts` (suggested) | Fetch persisted rows for month; build maps `(clients_id, mba_number, billing_month)` → record overlay; `(record_id, line_item_id)` → line overlay |
| `lib/finance/deriveReceivableRecords.ts` | After building synthetic rows, merge overlay: `billed`, notes, persisted `id` if exists; default `billed: false` |
| `lib/finance/deriveScopeSowReceivables.ts` | Same overlay for SOW rows |
| `lib/finance/deriveRetainerReceivables.ts` | Overlay keyed by `(clients_id, billing_month, billing_type=retainer)` — special-case null MBA |
| `lib/finance/derivePayableRecords.ts` | Attach line-level exceptions; pass `lineItemId` from `extractPayablesFromDeliverySchedule` into derived lines |
| `lib/finance/payablesReport.ts` | Extract and return `lineItemId` on each payable line |
| `app/api/finance/billing/route.ts` | Optional: single upstream fetch of finance records per request before derive |
| `app/api/finance/payables/route.ts` | Same for line items |
| `lib/types/financeBilling.ts` | New fields on types |
| `lib/finance/api.ts` | Client fetch/cache keys include overlay fields |

**Merge precedence:** Schedule-derived amounts and line structure are authoritative; persisted fields override **status only** (`billed`, `notes`, `exported_*`, line `line_status`, etc.). Missing persisted row → lazy defaults.

**Cache invalidation:**

- `clearRelevantPlanVersionsCache()` — already on billing-schedule PATCH; keep
- Add invalidation for any in-memory finance record cache when PATCH `finance_billing_records` or materialise
- Hub client `bumpReceivablesFetch` / month-keyed SWR — extend deps to include materialised id keys

### 7.3 Write path additions (Stage 2.2)

| Location | Category | Action |
|----------|----------|--------|
| `app/api/mediaplans/versions/[id]/billing-schedule/route.ts` | **Cat 2** schedule audit | After successful Xano PATCH: diff old vs new schedule JSON; POST `finance_edits` rows (`edit_type: amount_change`, `record_type: schedule_patch` or similar) |
| `app/api/mediaplans/mba/[mba_number]/route.ts` PUT | **Cat 2** | Audit new version schedules vs previous version (version N vs N-1) |
| `lib/api.ts` `createMediaPlanVersion` **or** new API proxy | **Cat 2** | **Must proxy create** or post-write audit hook — currently **bypasses** Next API |
| `app/api/finance/billing/[id]/route.ts` | **Cat 1** | On PATCH: upsert materialised record if needed; write `finance_edits` for `billed` / `notes` / `status` changes |
| New materialise helpers | **Cat 1** | `ensureFinanceBillingRecord(clients_id, mba_number, billing_month)` on first mark-billed |
| Schedule PATCH / version POST | **Cat 3** orphan | Compare `lineItemId` sets; soft-delete `finance_billing_line_items` with `orphaned: true` + `finance_edits` `line_remove` |
| `lib/finance/api.ts` | Client | New functions for mark-billed, line exception, materialise |

**Transactional concerns:**

- No cross-table transactions between Xano media plan PATCH and `finance_edits` POST today.
- **Recommendation:** If schedule PATCH succeeds and audit POST fails → **log + return 207/warning** or retry queue; do **not** roll back schedule (finance source of truth for amounts is schedule). Surface failed audit in admin log.
- Materialise-then-edit: race if two users mark billed concurrently — use upsert on unique `(clients_id, mba_number, billing_month)` in Xano.

### 7.4 Risk register

| Risk | Severity | Mitigation |
|------|----------|------------|
| `createMediaPlanVersion` posts schedules **directly to Xano** from browser | **High** | Add Next API proxy or server webhook for Cat 2 audit |
| Synthetic `id` 1..N on media rows — PATCH `finance_billing_records/{id}` hits wrong row | **High** | Stage 2.2 UI must use materialised id or composite key; never PATCH synthetic ids |
| `publishEdits({})` empty body — scope unclear | **Med** | Confirm Xano publish behaviour before gating |
| `relevantPlanVersions` 30s cache serves stale schedule after PATCH outside billing-schedule route | **Med** | Ensure all schedule writes call `clearRelevantPlanVersionsCache` |
| Retainer `mba_number: null` breaks `(clients_id, mba_number, billing_month)` uniqueness | **Med** | Use `(clients_id, billing_type, campaign_name, billing_month)` for retainers |
| `finance_edits` volume from schedule diffs | **Med** | Batch edits; summarise amount-only changes per MBA/month |
| Payables derived lines lack `lineItemId` today | **High** | Add extraction before line-item overlay |
| `GET /api/finance/edits` loads **all** edits then filters | **Med** | Add Xano filter params or month-scoped endpoint |
| Legacy `/api/finance/publishers` reads `finance_billing_records` | **Low** | Document deprecation; avoid divergent status |
| No role gating on finance PATCH routes | **Med** | Align with accrual (block `client` role) in 2.2 |
| Dead `/api/finance/edits/publish` proxy to missing Xano endpoint; `EditableFinanceGrid` still calls it | **Med** | **Stage 2.2 cleanup only:** remove `app/api/finance/edits/publish/route.ts` and update `components/finance/EditableFinanceGrid.tsx` to stop calling it in the same change set |
| `normalizeReceivableBillingRecord` unused | **Low** | Wire into overlay reader or remove |

### 7.5 Splitting Stage 2.2

**Recommendation: Option B** — split **2.2a** (read overlay + types + Xano reads, no audit) and **2.2b** (audit writes + materialise writes + orphan handling).

| Option | Rationale |
|--------|-----------|
| **A (single stage)** | ~18–22 files, 4 write surfaces + overlay + types — high blast radius, hard to test |
| **B (2.2a / 2.2b)** | 2.2a validates JOIN keys and UI with defaults; 2.2b adds 3 audit categories + create-page proxy — **preferred** |
| **C (read → UI → audit)** | Three steps — slower but safest if Luke wants incremental UAT |

**2.2a (~10 files):** `deriveReceivableRecords.ts`, `derivePayableRecords.ts`, `payablesReport.ts`, `billing/route.ts`, `payables/route.ts`, new overlay module, `financeBilling.ts`, `api.ts` read paths.

**2.2b (~12 files):** `billing-schedule/route.ts`, `mba/[mba_number]/route.ts`, `createMediaPlanVersion` proxy, `billing/[id]/route.ts`, new materialise service, `edits/route.ts` validation, orphan job in schedule saves.

---

## Open Questions for Claude

1. **Xano FK column name** on `finance_billing_line_items`: TS uses `finance_billing_records_id`; Stage 1 notes `finance_billing_record` (singular). Which is correct in Xano UI?

2. **Supplied Xano interfaces** (Luke 2026-05-27) are not in repo — please paste or confirm existing columns before 2.1 checklist.

3. **Retainer invoice grain:** `(clients_id, mba_number, billing_month)` fails when `mba_number` is null — use campaign name or synthetic MBA?

4. **SOW rows** use `mba_number: scope_id` string — confirm overlay JOIN uses same key as media.

5. **`publishEdits` with `{}`:** What does Xano `finance_edits/publish` do with empty body? `EditableFinanceGrid` depends on it.

6. **Synthetic media `id` vs materialised `id`:** Should API replace synthetic ids with persisted ids in 2.2a or maintain parallel `persisted_record_id` field?

7. **Service fee lines** (`T.Adserving`, `Production`, `Service`) have no `lineItemId` in schedule — are they invoice-grain only (no line-item exceptions)?

8. **Payables line overlay key:** publisher × MBA × `lineItemId` vs attaching to a payable `finance_billing_records` parent row — Stage 1 assumed line items link to `finance_billing_record` FK; is there a payable parent record per publisher group?

9. **Direct browser POST** `createMediaPlanVersion` — required to proxy for audit, or acceptable to defer Cat 2 audit for create-only until 2.3?

10. **`item_code` on line items** — any legacy Xano rows using `item_code` as business key that would conflict with new `line_item_id` column?

11. **Stage 1 `(clients_id, mba_number, billing_month)` uniqueness** vs merge key excluding `billing_month` for retainers — confirm Xano unique index definition.

12. **Conflicting status models:** `BillingRecord.status` (campaign-derived `draft`/`booked`) vs new `billed` boolean — should UI show both? Does `status=invoiced` remain for legacy rows?

---

*End of Stage 2.0 discovery document.*
