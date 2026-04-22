export type MoneyInput = number | string | null | undefined

export type MoneyFormatOptions = {
  locale?: string
  currency?: string
  /**
   * Defaults to 2 (keeps standard currency display).
   */
  minimumFractionDigits?: number
  /**
   * Defaults to 2 (standard currency display for budgets, media, fees).
   */
  maximumFractionDigits?: number
}

const DEFAULT_MIN_FRACTION = 2
const DEFAULT_MAX_FRACTION = 2

/** Used for buy amounts, rates, and average rates (higher precision). */
const RATE_MAX_FRACTION = 4

const formatterCache = new Map<string, Intl.NumberFormat>()

const MIN_FRACTION_DIGITS = 0
const MAX_FRACTION_DIGITS = 20

function toSafeFractionDigits(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  const rounded = Math.trunc(value)
  return Math.min(MAX_FRACTION_DIGITS, Math.max(MIN_FRACTION_DIGITS, rounded))
}

function normalizeFractionDigits({
  minimumFractionDigits = DEFAULT_MIN_FRACTION,
  maximumFractionDigits = DEFAULT_MAX_FRACTION,
}: Pick<MoneyFormatOptions, "minimumFractionDigits" | "maximumFractionDigits">): {
  minimumFractionDigits: number
  maximumFractionDigits: number
} {
  let min = toSafeFractionDigits(minimumFractionDigits, DEFAULT_MIN_FRACTION)
  let max = toSafeFractionDigits(maximumFractionDigits, DEFAULT_MAX_FRACTION)

  if (max < min) {
    min = Math.min(min, max)
  }

  return {
    minimumFractionDigits: min,
    maximumFractionDigits: max,
  }
}

function getNumberFormat({
  locale = "en-US",
  currency = "USD",
  minimumFractionDigits,
  maximumFractionDigits,
}: MoneyFormatOptions): Intl.NumberFormat {
  const normalizedFractions = normalizeFractionDigits({
    minimumFractionDigits,
    maximumFractionDigits,
  })
  const key = `${locale}|${currency}|${minimumFractionDigits}|${maximumFractionDigits}`
  const existing = formatterCache.get(key)
  if (existing) return existing

  const nf = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: normalizedFractions.minimumFractionDigits,
    maximumFractionDigits: normalizedFractions.maximumFractionDigits,
  })
  formatterCache.set(key, nf)
  return nf
}

/** Parses user-entered or formatted currency strings (same rules as {@link formatMoney}). */
export function parseMoneyInput(value: MoneyInput): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value !== "string") return null

  const trimmed = value.trim()
  if (!trimmed) return null

  const cleaned = trimmed.replace(/[^0-9.-]+/g, "")
  if (!cleaned) return null

  const parsed = Number.parseFloat(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Formats a money value with **min 2 / max 2** decimal places (budgets, media, fees).
 * - If the value is null/empty/invalid, returns an empty string.
 */
export function formatMoney(value: MoneyInput, options: MoneyFormatOptions = {}): string {
  const parsed = parseMoneyInput(value)
  if (parsed === null) return ""
  return getNumberFormat(options).format(parsed)
}

/**
 * Formats a rate value (buy amounts, rates, average rates) with up to 4 decimal places.
 * - If the value is null/empty/invalid, returns an empty string.
 */
export function formatRate(value: MoneyInput, options: MoneyFormatOptions = {}): string {
  const parsed = parseMoneyInput(value)
  if (parsed === null) return ""
  return getNumberFormat({
    maximumFractionDigits: RATE_MAX_FRACTION,
    ...options,
  }).format(parsed)
}

/**
 * Rounds a numeric currency value to 2 decimals (standard currency).
 * - Returns 0 for non-finite values.
 */
export function roundMoney2(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.round(value * 100) / 100
}

/**
 * Rounds a numeric currency value to 4 decimals (for rates / fractional precision).
 * - Returns 0 for non-finite values.
 */
export function roundMoney4(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Number(value.toFixed(RATE_MAX_FRACTION))
}

