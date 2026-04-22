import { formatCurrencyAUD } from "@/lib/format/currency"

export const formatNumberAU = (value: number) =>
  new Intl.NumberFormat("en-AU").format(Number(value) || 0)

export const formatCompactNumberAU = (value: number) =>
  new Intl.NumberFormat("en-AU", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(Number(value) || 0)

export const formatPercentage = (value: number, digits = 1) =>
  `${(Number(value) || 0).toFixed(digits)}%`

export const formatDateShortAU = (value: string) => {
  const d = new Date(`${value}T00:00:00`)
  if (Number.isNaN(d.getTime())) return value
  return new Intl.DateTimeFormat("en-AU", {
    month: "short",
    day: "numeric",
  }).format(d)
}

export type FormatDeltaMode = "currency" | "number" | "percent"

/** Signed delta: `+` / `-` prefix with currency, plain number, or percent formatting. */
export function formatDelta(value: number, format: FormatDeltaMode = "currency"): string {
  const n = Number(value) || 0
  if (n === 0) {
    if (format === "percent") return formatPercentage(0, 1)
    if (format === "number") return formatNumberAU(0)
    return formatCurrencyAUD(0)
  }
  const sign = n > 0 ? "+" : "-"
  const abs = Math.abs(n)
  const body =
    format === "currency"
      ? formatCurrencyAUD(abs)
      : format === "number"
        ? formatNumberAU(abs)
        : formatPercentage(abs, 1)
  return `${sign}${body}`
}
