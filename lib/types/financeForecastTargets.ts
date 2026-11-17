/**
 * Request/response types for mutable Finance Forecast **target** lines
 * (Postgres table `revenue_forecast_lines`; formerly Xano).
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
  /** ISO timestamp when last written. */
  updated_at?: string | null
  updated_by?: string | null
}

/** Natural upsert key — unique in PG on (clients_id, fy, line_key, month). */
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
