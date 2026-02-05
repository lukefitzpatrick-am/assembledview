type MoneyInput = number | string | null | undefined

export type MoneyFormatOptions = {
  locale?: string
  currency?: string
  /**
   * Defaults to 2 (keeps standard currency display).
   */
  minimumFractionDigits?: number
  /**
   * Defaults to 4 (supports fractional cents).
   */
  maximumFractionDigits?: number
}

const DEFAULT_MIN_FRACTION = 2
const DEFAULT_MAX_FRACTION = 4

const formatterCache = new Map<string, Intl.NumberFormat>()

function getNumberFormat({
  locale = "en-US",
  currency = "USD",
  minimumFractionDigits = DEFAULT_MIN_FRACTION,
  maximumFractionDigits = DEFAULT_MAX_FRACTION,
}: MoneyFormatOptions): Intl.NumberFormat {
  const key = `${locale}|${currency}|${minimumFractionDigits}|${maximumFractionDigits}`
  const existing = formatterCache.get(key)
  if (existing) return existing

  const nf = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits,
    maximumFractionDigits,
  })
  formatterCache.set(key, nf)
  return nf
}

function parseMoneyInput(value: MoneyInput): number | null {
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
 * Formats a money value with **min 2 / max 4** decimal places.
 * - If the value is null/empty/invalid, returns an empty string.
 */
export function formatMoney(value: MoneyInput, options: MoneyFormatOptions = {}): string {
  const parsed = parseMoneyInput(value)
  if (parsed === null) return ""
  return getNumberFormat(options).format(parsed)
}

/**
 * Rounds a numeric currency value to 4 decimals (fractional cents).
 * - Returns 0 for non-finite values.
 */
export function roundMoney4(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Number(value.toFixed(DEFAULT_MAX_FRACTION))
}

