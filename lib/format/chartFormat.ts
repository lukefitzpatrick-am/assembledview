export const formatNumberAU = (value: number) =>
  new Intl.NumberFormat("en-AU").format(Number(value) || 0)

export const formatPercentage = (value: number, digits = 1) =>
  `${(Number(value) || 0).toFixed(digits)}%`

/** Compact number (e.g. impressions): "1.2M", "845K", "0". */
export const formatNumberCompact = (value: number) =>
  new Intl.NumberFormat("en-AU", { notation: "compact", maximumFractionDigits: 1 }).format(
    Number.isFinite(value) ? value : 0,
  )
