import { NextRequest, NextResponse } from "next/server"
import axios from "axios"
import {
  parseBillingTypesQueryParam,
  parseSingleBillingMonthParam,
  type FinanceApiErrorBody,
} from "@/lib/finance/billingApiParams"
import { derivePayableRecordsForMonth } from "@/lib/finance/derivePayableRecords"
import {
  applyHubBillingRecordFilters,
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
    derived = applyHubBillingRecordFilters(
      derived,
      {
        clientsIdCsv: searchParams.get("clients_id"),
        search: searchParams.get("search"),
        statusCsv: null,
        publishersIdCsv: searchParams.get("publishers_id"),
        billingTypes: parsedTypes.types,
      },
      publisherIdMap
    )

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
