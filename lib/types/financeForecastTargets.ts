/**
 * Request/response types for mutable Finance Forecast **target** lines
 * (Xano table `revenue_forecast_lines`).
 *
 * Grain aligns 1:1 with booked forecast keys: same `line_key` + `month_key` unions.
 */

import type {
  FinanceForecastLineKey,
  FinanceForecastMonthKey,
} from "@/lib/types/financeForecast"

/** One persisted target cell (client × FY × line × month). */
export interface FinanceForecastTargetLine {
  id: string
  client_id: string
  client_name?: string | null
  financial_year_start_year: number
  line_key: FinanceForecastLineKey
  month_key: FinanceForecastMonthKey
  amount: number
  /** ISO timestamp when last written, when Xano returns it. */
  updated_at?: string | null
  updated_by?: string | null
}

/** Natural upsert key — unique in Xano on these four fields. */
export type FinanceForecastTargetUpsertKey = {
  client_id: string
  financial_year_start_year: number
  line_key: FinanceForecastLineKey
  month_key: FinanceForecastMonthKey
}

export type FinanceForecastTargetUpsertCell = FinanceForecastTargetUpsertKey & {
  amount: number
  client_name?: string | null
}

/** GET /api/finance/forecast/targets */
export type FinanceForecastTargetsListResponse = {
  lines: FinanceForecastTargetLine[]
  configured: boolean
  financial_year_start_year: number
  client_id?: string | null
}

/** POST /api/finance/forecast/targets — single cell upsert */
export type FinanceForecastTargetPostRequest = {
  client_id: string
  /** Alias accepted by the route; normalised to financial_year_start_year. */
  financial_year_start_year?: number
  fy?: number
  line_key: FinanceForecastLineKey
  month_key: FinanceForecastMonthKey
  amount: number
  client_name?: string | null
}

export type FinanceForecastTargetPostResponse = {
  ok: true
  line: FinanceForecastTargetLine
}

/** PATCH /api/finance/forecast/targets — batch grid save */
export type FinanceForecastTargetPatchRequest = {
  cells: FinanceForecastTargetUpsertCell[]
}

export type FinanceForecastTargetPatchResponse = {
  ok: true
  upserted: number
  lines: FinanceForecastTargetLine[]
}
