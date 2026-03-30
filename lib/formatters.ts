export function abbreviateNumber(value: number): string {
  const abs = Math.abs(value)
  const sign = value < 0 ? "-" : ""

  if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B`
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(1).replace(/\.0$/, "")}K`
  return `${sign}${abs.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
}

export function formatCurrency(value: number, currency = "USD"): string {
  const abs = Math.abs(value)
  if (abs >= 1_000) {
    const compact = abbreviateNumber(abs)
    const symbol = new Intl.NumberFormat("en-US", { style: "currency", currency, currencyDisplay: "symbol" })
      .formatToParts(0)
      .find((p) => p.type === "currency")?.value ?? "$"
    return `${value < 0 ? "-" : ""}${symbol}${compact}`
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value)
}

export function formatPercentage(value: number, decimals = 1): string {
  return `${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)}%`
}

function tokenFormatter(date: Date, format = "MMM d, yyyy"): string {
  const monthsShort = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  if (format === "MMM d, yyyy") {
    return `${monthsShort[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`
  }
  if (format === "yyyy-MM-dd") {
    const mm = String(date.getMonth() + 1).padStart(2, "0")
    const dd = String(date.getDate()).padStart(2, "0")
    return `${date.getFullYear()}-${mm}-${dd}`
  }
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date)
}

export function formatDate(date: string | Date, format = "MMM d, yyyy"): string {
  const parsed = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(parsed.getTime())) return String(date)
  return tokenFormatter(parsed, format)
}

export function getRelativeTime(date: string | Date): string {
  const parsed = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(parsed.getTime())) return String(date)

  const diffMs = parsed.getTime() - Date.now()
  const absSeconds = Math.round(Math.abs(diffMs) / 1000)
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" })

  if (absSeconds < 60) return rtf.format(Math.round(diffMs / 1000), "second")
  const absMinutes = Math.round(absSeconds / 60)
  if (absMinutes < 60) return rtf.format(Math.round(diffMs / (60 * 1000)), "minute")
  const absHours = Math.round(absMinutes / 60)
  if (absHours < 24) return rtf.format(Math.round(diffMs / (60 * 60 * 1000)), "hour")
  const absDays = Math.round(absHours / 24)
  if (absDays < 30) return rtf.format(Math.round(diffMs / (24 * 60 * 60 * 1000)), "day")
  const absMonths = Math.round(absDays / 30)
  if (absMonths < 12) return rtf.format(Math.round(diffMs / (30 * 24 * 60 * 60 * 1000)), "month")
  return rtf.format(Math.round(diffMs / (365 * 24 * 60 * 60 * 1000)), "year")
}
