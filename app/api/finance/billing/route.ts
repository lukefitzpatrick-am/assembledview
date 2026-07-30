import { NextRequest, NextResponse } from "next/server"
import axios from "axios"
import {
  parseBillingMonthRangeParams,
  parseBillingTypesQueryParam,
  parseSingleBillingMonthParam,
  type FinanceApiErrorBody,
} from "@/lib/finance/billingApiParams"
import {
  composeBillingRecordsForMonth,
  type HubQueryFilterParams,
} from "@/lib/finance/composeFinanceHubRecords"
import { type ScopeOfWorkRow } from "@/lib/finance/deriveScopeSowReceivables"
import {
  fetchAllPersistedFinanceStatusRows,
  fetchPersistedFinanceStatusForMonth,
} from "@/lib/finance/overlayFinanceStatus"
import {
  fetchRelevantPlanVersionsForFinanceMonth,
  fetchRelevantPlanVersionsForFinanceMonths,
} from "@/lib/finance/relevantPlanVersions"
import { getCachedClients, getCachedPublishers } from "@/lib/finance/xanoReferenceCache"
import { readScopeOfWork } from "@/lib/data/readFinance"
import type { BillingRecord, BillingType } from "@/lib/types/financeBilling"
import { requireFinanceAdmin } from "@/lib/requireRole"

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
 *
 * Two month shapes:
 *  - `billing_month=YYYY-MM` (default current month): single-month response `{ records }`.
 *  - `from=YYYY-MM&to=YYYY-MM`: multi-month response `{ records, failed_months? }` where shared
 *    inputs (plan-version superset, clients, publishers, scopes, persisted status) are fetched
 *    ONCE and each month is derived with the same per-month pipeline as the single-month path —
 *    so the multi-month records are byte-identical to concatenated single-month responses.
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

function versionsFetchErrorResponse(e: unknown): NextResponse {
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

async function fetchScopesOrNull(): Promise<ScopeOfWorkRow[] | null> {
  try {
    const scopes = await readScopeOfWork()
    return scopes as unknown as ScopeOfWorkRow[]
  } catch (e: unknown) {
    console.error("[finance-api] billing scope fetch failed", {
      message: e instanceof Error ? e.message : String(e),
    })
    return null
  }
}

function hubFilterParams(incoming: URLSearchParams, types: BillingType[]): HubQueryFilterParams {
  return {
    types,
    clientsIdParam: incoming.get("clients_id"),
    searchParam: incoming.get("search"),
    statusParam: incoming.get("status"),
    publishersIdParam: incoming.get("publishers_id"),
  }
}

export async function GET(request: NextRequest) {
  const gate = await requireFinanceAdmin(request)
  if ("response" in gate) return gate.response

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

    const fromRaw = incoming.get("from")
    const toRaw = incoming.get("to")
    if (fromRaw != null || toRaw != null) {
      return await handleMultiMonth(incoming, parsedTypes.types, fromRaw, toRaw)
    }

    const monthParsed = parseSingleBillingMonthParam(incoming.get("billing_month"), { defaultWhenMissing: true })
    if (!("ok" in monthParsed && monthParsed.ok)) {
      return jsonError(monthParsed as FinanceApiErrorBody, 400)
    }
    const monthStr = monthParsed.month

    const includeNonBooked = incoming.get("include_drafts") !== "0"
    const wantSow = parsedTypes.types.length === 0 || parsedTypes.types.includes("sow")

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
      return versionsFetchErrorResponse(e)
    }

    const [clients, publishers] = await Promise.all([getCachedClients(), getCachedPublishers()])
    const scopes = wantSow ? await fetchScopesOrNull() : null
    // Domain 5 Stage 2.2a — overlay persisted status onto derived rows.
    const persistedStatusRows = await fetchPersistedFinanceStatusForMonth(monthStr)

    const merged = composeBillingRecordsForMonth({
      monthStr,
      relevantVersions,
      clients: clients as Record<string, unknown>[],
      publishers: publishers as Record<string, unknown>[],
      scopes,
      persistedStatusRows,
      includeNonBooked,
      ...hubFilterParams(incoming, parsedTypes.types),
    })

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

/**
 * Multi-month path: shared inputs fetched once, months derived in a loop with the
 * exact single-month pipeline. A month whose derivation throws is reported in
 * `failed_months` instead of failing the whole range — one bad plan must not blank
 * a full-FY hub load.
 */
async function handleMultiMonth(
  incoming: URLSearchParams,
  types: BillingType[],
  fromRaw: string | null,
  toRaw: string | null
): Promise<NextResponse> {
  const rangeParsed = parseBillingMonthRangeParams(fromRaw, toRaw)
  if (!("ok" in rangeParsed && rangeParsed.ok)) {
    return jsonError(rangeParsed as FinanceApiErrorBody, 400)
  }
  const months = rangeParsed.months

  const includeNonBooked = incoming.get("include_drafts") !== "0"
  const wantSow = types.length === 0 || types.includes("sow")

  let versionsByMonth: Map<string, { relevantVersions: unknown[] }>
  try {
    const result = await fetchRelevantPlanVersionsForFinanceMonths(months)
    if ("error" in result) {
      return NextResponse.json({ error: result.error, field: "billing_month" }, { status: result.status })
    }
    versionsByMonth = result
  } catch (e: unknown) {
    return versionsFetchErrorResponse(e)
  }

  const [clients, publishers] = await Promise.all([getCachedClients(), getCachedPublishers()])
  const scopes = wantSow ? await fetchScopesOrNull() : null
  const persistedStatusRows = await fetchAllPersistedFinanceStatusRows()

  const filterParams = hubFilterParams(incoming, types)
  const records: BillingRecord[] = []
  const failedMonths: Array<{ month: string; error: string }> = []

  for (const monthStr of months) {
    try {
      const relevantVersions =
        (versionsByMonth.get(monthStr)?.relevantVersions as Record<string, unknown>[] | undefined) ?? []
      records.push(
        ...composeBillingRecordsForMonth({
          monthStr,
          relevantVersions,
          clients: clients as Record<string, unknown>[],
          publishers: publishers as Record<string, unknown>[],
          scopes,
          persistedStatusRows,
          includeNonBooked,
          ...filterParams,
        })
      )
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e)
      console.error("[finance-api] billing multi-month derive failed", { month: monthStr, message })
      failedMonths.push({ month: monthStr, error: message })
    }
  }

  return NextResponse.json({
    records,
    ...(failedMonths.length > 0 ? { failed_months: failedMonths } : {}),
  })
}
