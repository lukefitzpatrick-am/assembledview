import { formatMoney, formatMoneyCompact } from "@/lib/format/money"

export type FormatCurrencyCompactOptions = {
  currency?: string
  locale?: string
}

export type FormatCurrencyFullOptions = {
  currency?: string
  locale?: string
  minimumFractionDigits?: number
  maximumFractionDigits?: number
}

const DEFAULT_LOCALE = "en-AU"
const DEFAULT_CURRENCY = "AUD"
const DEFAULT_FULL_MAX_FRACTION = 2

function safeNumber(value: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

/**
 * Compact AUD for charts/KPI. Custom locale/currency options use the legacy
 * formatMoney overload (editor/export callers) — whole dollars, not compact notation.
 */
export function formatCurrencyCompact(value: number, options?: FormatCurrencyCompactOptions): string {
  if (options?.locale || options?.currency) {
    return (
      formatMoney(safeNumber(value), {
        locale: options.locale ?? DEFAULT_LOCALE,
        currency: options.currency ?? DEFAULT_CURRENCY,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }) || formatMoney(0, { decimals: 0 })
    )
  }
  return formatMoneyCompact(safeNumber(value))
}

export function formatCurrencyFull(value: number, options?: FormatCurrencyFullOptions): string {
  const locale = options?.locale ?? DEFAULT_LOCALE
  const currency = options?.currency ?? DEFAULT_CURRENCY
  const maximumFractionDigits = options?.maximumFractionDigits ?? DEFAULT_FULL_MAX_FRACTION
  const minimumFractionDigits =
    options?.minimumFractionDigits !== undefined
      ? options.minimumFractionDigits
      : maximumFractionDigits

  if (
    locale === DEFAULT_LOCALE &&
    currency === DEFAULT_CURRENCY &&
    maximumFractionDigits === 2 &&
    minimumFractionDigits === 2
  ) {
    return formatMoney(safeNumber(value))
  }

  if (
    locale === DEFAULT_LOCALE &&
    currency === DEFAULT_CURRENCY &&
    maximumFractionDigits === 0 &&
    minimumFractionDigits === 0
  ) {
    return formatMoney(safeNumber(value), { decimals: 0 })
  }

  // Legacy path: explicit locale/currency/fraction options (do not change call sites).
  return (
    formatMoney(safeNumber(value), {
      locale,
      currency,
      minimumFractionDigits,
      maximumFractionDigits,
    }) || formatMoney(0)
  )
}

/**
 * Whole-dollar AUD (legacy chart / tooltip / hero style).
 * Prefer {@link formatMoney} with `{ decimals: 0 }` for new call sites.
 */
export function formatCurrencyAUD(value: number): string {
  return formatMoney(safeNumber(value), { decimals: 0 })
}
