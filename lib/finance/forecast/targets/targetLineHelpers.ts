/**
 * Pure helpers for Finance Forecast target lines (shared by PG + legacy Xano paths).
 */

import {
  FINANCE_FORECAST_FISCAL_MONTH_ORDER,
  FINANCE_FORECAST_LINE_KEYS,
  type FinanceForecastLineKey,
  type FinanceForecastMonthKey,
} from "@/lib/types/financeForecast"
import type { FinanceForecastTargetLine } from "@/lib/types/financeForecastTargets"

const LINE_KEY_SET = new Set<string>(Object.values(FINANCE_FORECAST_LINE_KEYS))
const MONTH_KEY_SET = new Set<string>(FINANCE_FORECAST_FISCAL_MONTH_ORDER)

export function isFinanceForecastLineKey(v: unknown): v is FinanceForecastLineKey {
  return typeof v === "string" && LINE_KEY_SET.has(v)
}

export function isFinanceForecastMonthKey(v: unknown): v is FinanceForecastMonthKey {
  return typeof v === "string" && MONTH_KEY_SET.has(v)
}

export function targetLineNaturalKey(line: {
  client_id: string
  financial_year_start_year: number
  line_key: string
  month_key: string
}): string {
  return `${line.client_id}::${line.financial_year_start_year}::${line.line_key}::${line.month_key}`
}

export function normalizeTargetLine(raw: Record<string, unknown>): FinanceForecastTargetLine | null {
  const client_id = raw.client_id != null ? String(raw.client_id) : ""
  const fyRaw = raw.financial_year_start_year ?? raw.financial_year ?? raw.fy
  const financial_year_start_year =
    typeof fyRaw === "number"
      ? fyRaw
      : typeof fyRaw === "string"
        ? Number.parseInt(fyRaw, 10)
        : NaN
  const line_key = raw.line_key
  const month_key = raw.month_key ?? raw.month
  const amount = Number(raw.amount ?? 0)

  if (!client_id || !Number.isFinite(financial_year_start_year)) return null
  if (!isFinanceForecastLineKey(line_key) || !isFinanceForecastMonthKey(month_key)) return null
  if (!Number.isFinite(amount)) return null

  return {
    id:
      raw.id != null
        ? String(raw.id)
        : targetLineNaturalKey({
            client_id,
            financial_year_start_year,
            line_key,
            month_key,
          }),
    client_id,
    client_name:
      raw.client_name == null
        ? null
        : typeof raw.client_name === "string"
          ? raw.client_name
          : String(raw.client_name),
    financial_year_start_year,
    line_key,
    month_key,
    amount,
    updated_at: raw.updated_at != null ? String(raw.updated_at) : null,
    updated_by: raw.updated_by != null ? String(raw.updated_by) : null,
  }
}

/** Target store is Postgres (DATABASE_URL). */
export function isTargetStorageConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim())
}
