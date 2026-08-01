/**
 * Client fetch for POST /api/finance/sections/investment/cut → ViewState.
 */

import type { ViewState } from "@/lib/ui/viewState"
import type {
  InvestmentCutGrainError,
  InvestmentCutRequest,
  InvestmentCutResponse,
} from "./cutTypes"
import type { AgencyEconomicsHistoricError } from "./agencyEconomics"

export type AgencyRevenueGrainClientError = {
  code: "AGENCY_REVENUE_GRAIN_UNSUPPORTED"
  error: "AGENCY_REVENUE_GRAIN_UNSUPPORTED"
  message: string
  blockedDimensions?: string[]
}

export type InvestmentCutBlockedError =
  | InvestmentCutGrainError
  | AgencyEconomicsHistoricError
  | AgencyRevenueGrainClientError

export type InvestmentCutFetchResult =
  | ViewState<InvestmentCutResponse>
  | { status: "grain-error"; error: InvestmentCutBlockedError; retry?: () => void }

const BLOCKED_422 = new Set([
  "ACTUALS_GRAIN_UNSUPPORTED",
  "AGENCY_ECONOMICS_HISTORIC_FY_BLOCKED",
  "AGENCY_REVENUE_GRAIN_UNSUPPORTED",
])

export async function fetchInvestmentCutClient(
  body: InvestmentCutRequest,
  options: { signal?: AbortSignal; retry?: () => void } = {}
): Promise<InvestmentCutFetchResult> {
  try {
    const res = await fetch("/api/finance/sections/investment/cut", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: options.signal,
    })
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (
      res.status === 422 &&
      typeof json.error === "string" &&
      BLOCKED_422.has(json.error)
    ) {
      return {
        status: "grain-error",
        error: json as unknown as InvestmentCutBlockedError,
        retry: options.retry,
      }
    }
    if (!res.ok) {
      const message =
        (typeof json.message === "string" && json.message) ||
        (typeof json.error === "string" && json.error) ||
        `Request failed (${res.status})`
      return { status: "error", message, retry: options.retry }
    }
    return { status: "ready", data: json as unknown as InvestmentCutResponse }
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return { status: "loading" }
    }
    return {
      status: "error",
      message: err instanceof Error ? err.message : "Network error",
      retry: options.retry,
    }
  }
}
