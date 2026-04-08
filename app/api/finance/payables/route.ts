import { NextRequest, NextResponse } from "next/server"
import axios from "axios"
import { parseSingleBillingMonthParam, type FinanceApiErrorBody } from "@/lib/finance/billingApiParams"
import { derivePayableRecordsForMonth } from "@/lib/finance/derivePayableRecords"
import { fetchRelevantPlanVersionsForFinanceMonth } from "@/lib/finance/relevantPlanVersions"
import type { BillingRecord } from "@/lib/types/financeBilling"

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

function filterByClients(rows: BillingRecord[], clientsIdCsv: string | null): BillingRecord[] {
  const ids = (clientsIdCsv || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  if (ids.length === 0) return rows
  const want = new Set(ids.map((s) => String(s)))
  return rows.filter((r) => want.has(String(r.clients_id)))
}

function filterBySearch(rows: BillingRecord[], search: string | null): BillingRecord[] {
  const q = (search || "").trim().toLowerCase()
  if (!q) return rows
  return rows.filter((r) => {
    const hay = [
      r.client_name,
      r.mba_number,
      r.campaign_name,
      r.billing_month,
      r.status,
      ...r.line_items.map((li) => [li.publisher_name, li.media_type, li.description].join(" ")),
    ]
      .join(" ")
      .toLowerCase()
    return hay.includes(q)
  })
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
    const billingMonthParam = searchParams.get("billing_month")
    const monthParsed = parseSingleBillingMonthParam(billingMonthParam, { defaultWhenMissing: true })
    if (!("ok" in monthParsed && monthParsed.ok)) {
      return jsonError(monthParsed as FinanceApiErrorBody, 400)
    }
    const monthStr = monthParsed.month

    const clientsIdParam = searchParams.get("clients_id")
    const searchParam = searchParams.get("search")

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

    let derived = derivePayableRecordsForMonth(relevantVersions, year, month)
    derived = filterByClients(derived, clientsIdParam)
    derived = filterBySearch(derived, searchParam)

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
