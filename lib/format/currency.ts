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
const DEFAULT_COMPACT_MAX_FRACTION = 0

function safeNumber(value: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

export function formatCurrencyCompact(value: number, options?: FormatCurrencyCompactOptions): string {
  const locale = options?.locale ?? DEFAULT_LOCALE
  const currency = options?.currency ?? DEFAULT_CURRENCY
  const maximumFractionDigits = DEFAULT_COMPACT_MAX_FRACTION
  const safeValue = safeNumber(value)
  if (safeValue === 0) {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits,
    }).format(0)
  }
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    notation: "compact",
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(safeValue)
}

export function formatCurrencyFull(value: number, options?: FormatCurrencyFullOptions): string {
  const locale = options?.locale ?? DEFAULT_LOCALE
  const currency = options?.currency ?? DEFAULT_CURRENCY
  const maximumFractionDigits = options?.maximumFractionDigits ?? DEFAULT_FULL_MAX_FRACTION
  const minimumFractionDigits = options?.minimumFractionDigits
  const fmt: Intl.NumberFormatOptions = {
    style: "currency",
    currency,
    maximumFractionDigits,
  }
  if (minimumFractionDigits !== undefined) {
    fmt.minimumFractionDigits = minimumFractionDigits
  }
  return new Intl.NumberFormat(locale, fmt).format(safeNumber(value))
}

/**
 * Whole-dollar AUD (legacy chart / tooltip / hero style).
 * Equivalent to `formatCurrencyFull(v, { currency: "AUD", locale: "en-AU", maximumFractionDigits: 0, minimumFractionDigits: 0 })`.
 * Kept for backwards compatibility with prior `lib/charts/format` behaviour. Prefer `formatCurrencyFull` when you need cents.
 */
export function formatCurrencyAUD(value: number): string {
  return formatCurrencyFull(value, {
    currency: "AUD",
    locale: "en-AU",
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  })
}
