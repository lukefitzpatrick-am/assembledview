import { formatMoney } from "@/lib/format/money"

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
