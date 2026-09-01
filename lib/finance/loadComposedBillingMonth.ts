/**
 * I/O loader for one billing month. GET /api/finance/billing (single-month)
 * and POST /api/finance/billing/approve share this so the approval snapshot
 * is taken from the same composed records the hub lists.
 *
 * composeBillingRecordsForMonth stays I/O-free.
 */

import "server-only"

import axios from "axios"
import {
  composeBillingRecordsForMonth,
  type HubQueryFilterParams,
} from "@/lib/finance/composeFinanceHubRecords"
import { type ScopeOfWorkRow } from "@/lib/finance/deriveScopeSowReceivables"
import { fetchPersistedFinanceStatusForMonth } from "@/lib/finance/overlayFinanceStatus"
import { fetchRelevantPlanVersionsForFinanceMonth } from "@/lib/finance/relevantPlanVersions"
import { getCachedClients, getCachedPublishers } from "@/lib/finance/xanoReferenceCache"
import { hydrateVersionsFinanceScheduleSource } from "@/lib/finance/scheduleMonthsSource"
import { readScopeOfWork } from "@/lib/data/readFinance"
import type { BillingRecord, BillingType } from "@/lib/types/financeBilling"

export type LoadComposedBillingMonthOk = { ok: true; records: BillingRecord[] }
export type LoadComposedBillingMonthErr = {
  ok: false
  status: number
  error: string
  field?: string
}

export async function fetchScopesOrNull(): Promise<ScopeOfWorkRow[] | null> {
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

function clientErrorFromUpstreamBody(data: unknown, upstreamStatus: number): { error: string; field?: string } {
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

function versionsLoadError(e: unknown): LoadComposedBillingMonthErr {
  const ax = axios.isAxiosError(e)
  const status =
    ax && e.response?.status != null && e.response.status >= 400 && e.response.status <= 599
      ? e.response.status
      : 502
  const base =
    ax && e.response?.data != null
      ? clientErrorFromUpstreamBody(e.response.data, status)
      : { error: "Failed to load media plan versions" }
  return { ok: false, status, error: base.error, field: base.field ?? "billing_month" }
}

export async function loadComposedBillingRecordsForMonth(input: {
  monthStr: string
  includeNonBooked?: boolean
  filters?: HubQueryFilterParams
}): Promise<LoadComposedBillingMonthOk | LoadComposedBillingMonthErr> {
  const includeNonBooked = input.includeNonBooked !== false
  const filters: HubQueryFilterParams = input.filters ?? {
    types: [] as BillingType[],
    clientsIdParam: null,
    searchParam: null,
    statusParam: null,
    publishersIdParam: null,
  }
  const wantSow = filters.types.length === 0 || filters.types.includes("sow")

  let relevantVersions: Record<string, unknown>[] = []
  try {
    const versionsResult = await fetchRelevantPlanVersionsForFinanceMonth(input.monthStr)
    if ("error" in versionsResult) {
      return {
        ok: false,
        status: versionsResult.status,
        error: versionsResult.error,
        field: "billing_month",
      }
    }
    relevantVersions = versionsResult.relevantVersions as Record<string, unknown>[]
    await hydrateVersionsFinanceScheduleSource(relevantVersions)
  } catch (e: unknown) {
    return versionsLoadError(e)
  }

  const [clients, publishers] = await Promise.all([getCachedClients(), getCachedPublishers()])
  const scopes = wantSow ? await fetchScopesOrNull() : null
  const persistedStatusRows = await fetchPersistedFinanceStatusForMonth(input.monthStr)

  const records = composeBillingRecordsForMonth({
    monthStr: input.monthStr,
    relevantVersions,
    clients: clients as Record<string, unknown>[],
    publishers: publishers as Record<string, unknown>[],
    scopes,
    persistedStatusRows,
    includeNonBooked,
    ...filters,
  })

  return { ok: true, records }
}
