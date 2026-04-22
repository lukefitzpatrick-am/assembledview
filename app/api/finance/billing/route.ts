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

function filterByStatuses(rows: BillingRecord[], statusCsv: string | null): BillingRecord[] {
  const parts = (statusCsv || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  if (parts.length === 0) return rows
  const want = new Set(parts)
  return rows.filter((r) => want.has(r.status))
}

function filterByPublisherIds(
  rows: BillingRecord[],
  publisherIdsCsv: string | null,
  publisherIdMap: Map<number, string>
): BillingRecord[] {
  const rawIds = (publisherIdsCsv || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number)
    .filter((n) => Number.isFinite(n))
  if (rawIds.length === 0) return rows
  const want = new Set(
    rawIds.map((id) => (publisherIdMap.get(id) || "").trim()).filter(Boolean)
  )
  if (want.size === 0) return rows
  return rows.filter((r) => {
    if (r.billing_type === "retainer" || r.billing_type === "sow") return true
    return r.line_items.some((li) => {
      const n = (li.publisher_name || "").trim()
      return n && want.has(n)
    })
  })
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

    if (wantMedia || wantSow) {
      const fromPlans = derivePlanReceivableBillingRecordsForMonth(
        relevantVersions,
        year,
        month,
        publisherNameMap,
        clientMap,
        { includeNonBookedCampaigns: includeNonBooked }
      )
      for (const rec of fromPlans) {
        if (rec.billing_type === "media" && !wantMedia) continue
        if (rec.billing_type === "sow" && !wantSow) continue
        derived.push(rec)
      }
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

    if (parsedTypes.types.length > 0) {
      const want = new Set(parsedTypes.types)
      merged = merged.filter((r) => want.has(r.billing_type))
    }

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
