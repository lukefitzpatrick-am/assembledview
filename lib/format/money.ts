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

export type FormatMoneyDisplayOptions = {
  /** Default 2. Use 0 for whole-dollar display. */
  decimals?: 0 | 2
}

const DEFAULT_MIN_FRACTION = 2
const DEFAULT_MAX_FRACTION = 2

/** Used for buy amounts, rates, and average rates (higher precision). */
const RATE_MAX_FRACTION = 4
const AUD_LOCALE = "en-AU"
const AUD_CURRENCY = "AUD"

const formatterCache = new Map<string, Intl.NumberFormat>()

const MIN_FRACTION_DIGITS = 0
const MAX_FRACTION_DIGITS = 20

const displayMoneyFormatterCache = new Map<string, Intl.NumberFormat>()

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
  locale = AUD_LOCALE,
  currency = AUD_CURRENCY,
  minimumFractionDigits,
  maximumFractionDigits,
}: MoneyFormatOptions): Intl.NumberFormat {
  const normalizedFractions = normalizeFractionDigits({
    minimumFractionDigits,
    maximumFractionDigits,
  })
  const key = `${locale}|${currency}|${normalizedFractions.minimumFractionDigits}|${normalizedFractions.maximumFractionDigits}`
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

function isLegacyMoneyOptions(
  opts?: FormatMoneyDisplayOptions | MoneyFormatOptions,
): opts is MoneyFormatOptions {
  if (!opts) return false
  return (
    "locale" in opts ||
    "currency" in opts ||
    "minimumFractionDigits" in opts ||
    "maximumFractionDigits" in opts
  )
}

function getDisplayMoneyFormatter(decimals: 0 | 2): Intl.NumberFormat {
  const key = `display|${decimals}`
  const existing = displayMoneyFormatterCache.get(key)
  if (existing) return existing
  const nf = new Intl.NumberFormat(AUD_LOCALE, {
    style: "currency",
    currency: AUD_CURRENCY,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
  displayMoneyFormatterCache.set(key, nf)
  return nf
}

const compactMoneyFormatter = new Intl.NumberFormat(AUD_LOCALE, {
  style: "currency",
  currency: AUD_CURRENCY,
  notation: "compact",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

const compactMoneyFormatterByFraction = new Map<number, Intl.NumberFormat>()

function compactMoneyFormatterWithFraction(fractionDigits: 1 | 2): Intl.NumberFormat {
  const existing = compactMoneyFormatterByFraction.get(fractionDigits)
  if (existing) return existing
  const nf = new Intl.NumberFormat(AUD_LOCALE, {
    style: "currency",
    currency: AUD_CURRENCY,
    notation: "compact",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })
  compactMoneyFormatterByFraction.set(fractionDigits, nf)
  return nf
}

export type FormatMoneyCompactOptions = {
  /**
   * Home Media Spend to Date: two compact decimals for millions below $10M
   * (`$1.06M`), one decimal at/above (`$12.4M`). Thousands stay on the default
   * one-decimal K rule. Other KPI tiles omit this option.
   */
  millionScale?: "home-spend"
}

/** Parses user-entered or formatted currency strings (same rules as legacy {@link formatMoney}). */
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
 * Formats an AUD currency value with exactly 2 decimal places.
 * - If the value is null/empty/invalid, returns "$0.00".
 */
export function formatAUD(value: MoneyInput): string {
  const parsed = parseMoneyInput(value) ?? 0
  return getNumberFormat({
    locale: AUD_LOCALE,
    currency: AUD_CURRENCY,
    minimumFractionDigits: DEFAULT_MIN_FRACTION,
    maximumFractionDigits: DEFAULT_MAX_FRACTION,
  }).format(parsed)
}

/**
 * Formats an AUD buy amount with min 2 / max 4 decimal places.
 * - If the value is null/empty/invalid, returns "$0.00".
 */
export function formatBuyAmount(value: MoneyInput): string {
  const parsed = parseMoneyInput(value) ?? 0
  return getNumberFormat({
    locale: AUD_LOCALE,
    currency: AUD_CURRENCY,
    minimumFractionDigits: DEFAULT_MIN_FRACTION,
    maximumFractionDigits: RATE_MAX_FRACTION,
  }).format(parsed)
}

/**
 * Client-facing AUD money display (en-AU).
 * Returns "—" for null/undefined/NaN — never "$NaN".
 *
 * Legacy overload: when `options` includes locale/currency/fraction-digit fields
 * (editor grids, bursts_json serialization), keeps the prior MoneyInput behaviour
 * and returns "" for invalid values.
 */
export function formatMoney(value: number | null | undefined, opts?: FormatMoneyDisplayOptions): string
export function formatMoney(value: MoneyInput, options?: MoneyFormatOptions): string
export function formatMoney(
  value: MoneyInput,
  options?: FormatMoneyDisplayOptions | MoneyFormatOptions,
): string {
  if (isLegacyMoneyOptions(options) || typeof value === "string") {
    const parsed = parseMoneyInput(value)
    if (parsed === null) return ""
    return getNumberFormat(isLegacyMoneyOptions(options) ? options : {}).format(parsed)
  }

  if (value === null || value === undefined || Number.isNaN(value)) return "—"
  if (!Number.isFinite(value)) return "—"

  const decimals = options && "decimals" in options && options.decimals !== undefined ? options.decimals : 2
  return getDisplayMoneyFormatter(decimals).format(value)
}

/**
 * Compact AUD for KPI tiles and chart axes — e.g. "$43.0K".
 * Values under 1000 fall back to {@link formatMoney} with whole dollars.
 * Returns "—" for null/undefined/NaN.
 */
export function formatMoneyCompact(
  value: number | null | undefined,
  opts?: FormatMoneyCompactOptions,
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—"
  if (!Number.isFinite(value)) return "—"
  if (Math.abs(value) < 1000) return formatMoney(value, { decimals: 0 })
  if (opts?.millionScale === "home-spend") {
    const abs = Math.abs(value)
    const fractionDigits: 1 | 2 = abs >= 1_000_000 && abs < 10_000_000 ? 2 : 1
    return compactMoneyFormatterWithFraction(fractionDigits).format(value)
  }
  return compactMoneyFormatter.format(value)
}

/**
 * Formats a value that is already a percentage (58.1 → "58.1%"), not a 0–1 fraction.
 * Returns "—" for null/undefined/NaN.
 */
export function formatPercent(
  value: number | null | undefined,
  opts?: { decimals?: 0 | 1 | 2 },
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—"
  if (!Number.isFinite(value)) return "—"
  const decimals = opts?.decimals ?? 1
  // min = max when decimals are specified so tabular columns don't ragged
  // between "58%" and "58.1%".
  const formatted = new Intl.NumberFormat(AUD_LOCALE, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)
  return `${formatted}%`
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
