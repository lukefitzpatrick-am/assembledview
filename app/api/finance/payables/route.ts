import { NextRequest, NextResponse } from "next/server"
import axios from "axios"
import {
  parseBillingMonthRangeParams,
  parseBillingTypesQueryParam,
  parseSingleBillingMonthParam,
  type FinanceApiErrorBody,
} from "@/lib/finance/billingApiParams"
import { composePayableRecordsForMonth } from "@/lib/finance/composeFinanceHubRecords"
import {
  fetchRelevantPlanVersionsForFinanceMonth,
  fetchRelevantPlanVersionsForFinanceMonths,
} from "@/lib/finance/relevantPlanVersions"
import { getCachedPublishers } from "@/lib/finance/xanoReferenceCache"
import type { BillingRecord, BillingType } from "@/lib/types/financeBilling"
import { requireFinanceAdmin } from "@/lib/requireRole"

export const maxDuration = 60

export const dynamic = "force-dynamic"
export const revalidate = 0

const XANO_BASE = process.env.XANO_CLIENTS_BASE_URL

/**
 * Read-only publisher payables: rows are derived live from `media_plan_versions.deliverySchedule`
 * (and `delivery_schedule`). This route does not read or write Xano `finance_billing_records`.
 * Client + publisher + MBA grouping matches the legacy `/finance/publishers` view and is performed
 * inside `derivePayableRecordsForMonth`.
 *
 * Two month shapes:
 *  - `billing_month=YYYY-MM` (default current month): single-month response `{ records }`.
 *  - `from=YYYY-MM&to=YYYY-MM`: multi-month response `{ records, failed_months? }` where the
 *    plan-version superset is fetched ONCE and each month is derived with the same per-month
 *    pipeline as the single-month path.
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
  const base =
    ax && e.response?.data != null
      ? clientErrorFromUpstreamBody(e.response.data, status)
      : { error: "Failed to load media plan versions" }
  return NextResponse.json({ ...base, field: "billing_month" }, { status })
}

export async function GET(request: NextRequest) {
  const gate = await requireFinanceAdmin(request)
  if ("response" in gate) return gate.response

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

    const fromRaw = searchParams.get("from")
    const toRaw = searchParams.get("to")
    if (fromRaw != null || toRaw != null) {
      return await handleMultiMonth(searchParams, parsedTypes.types, fromRaw, toRaw)
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
      relevantVersions = versionsResult.relevantVersions as Record<string, unknown>[]
    } catch (e: unknown) {
      return versionsFetchErrorResponse(e)
    }

    const publishers = (await getCachedPublishers()) as Record<string, unknown>[]

    const derived = composePayableRecordsForMonth({
      year,
      month,
      relevantVersions,
      publishers,
      includeNonBooked,
      types: parsedTypes.types,
      clientsIdParam: searchParams.get("clients_id"),
      searchParam: searchParams.get("search"),
      publishersIdParam: searchParams.get("publishers_id"),
    })

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

/**
 * Multi-month path: plan-version superset fetched once, months derived in a loop
 * with the exact single-month pipeline. A month whose derivation throws is reported
 * in `failed_months` instead of failing the whole range.
 */
async function handleMultiMonth(
  searchParams: URLSearchParams,
  types: BillingType[],
  fromRaw: string | null,
  toRaw: string | null
): Promise<NextResponse> {
  const rangeParsed = parseBillingMonthRangeParams(fromRaw, toRaw)
  if (!("ok" in rangeParsed && rangeParsed.ok)) {
    return jsonError(rangeParsed as FinanceApiErrorBody, 400)
  }
  const months = rangeParsed.months

  const includeNonBooked = searchParams.get("include_drafts") !== "0"

  let versionsByMonth: Map<string, { year: number; month: number; relevantVersions: unknown[] }>
  try {
    const result = await fetchRelevantPlanVersionsForFinanceMonths(months)
    if ("error" in result) {
      return NextResponse.json({ error: result.error, field: "billing_month" }, { status: result.status })
    }
    versionsByMonth = result
  } catch (e: unknown) {
    return versionsFetchErrorResponse(e)
  }

  const publishers = (await getCachedPublishers()) as Record<string, unknown>[]

  const records: BillingRecord[] = []
  const failedMonths: Array<{ month: string; error: string }> = []

  for (const monthStr of months) {
    try {
      const entry = versionsByMonth.get(monthStr)
      const year = entry?.year ?? Number(monthStr.slice(0, 4))
      const month = entry?.month ?? Number(monthStr.slice(5, 7))
      const relevantVersions = (entry?.relevantVersions as Record<string, unknown>[] | undefined) ?? []
      records.push(
        ...composePayableRecordsForMonth({
          year,
          month,
          relevantVersions,
          publishers,
          includeNonBooked,
          types,
          clientsIdParam: searchParams.get("clients_id"),
          searchParam: searchParams.get("search"),
          publishersIdParam: searchParams.get("publishers_id"),
        })
      )
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e)
      console.error("[finance-api] payables multi-month derive failed", { month: monthStr, message })
      failedMonths.push({ month: monthStr, error: message })
    }
  }

  return NextResponse.json({
    records,
    ...(failedMonths.length > 0 ? { failed_months: failedMonths } : {}),
  })
}
