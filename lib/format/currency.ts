export function formatCurrencyCompact(value: number | undefined, currency = "AUD"): string {
  const safeValue = typeof value === "number" && Number.isFinite(value) ? value : 0
  if (safeValue === 0) {
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(0)
  }
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency,
    notation: "compact",
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(safeValue)
}

export function formatCurrencyFull(value: number | undefined, currency = "AUD"): string {
  const safeValue = typeof value === "number" && Number.isFinite(value) ? value : 0
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(safeValue)
}
