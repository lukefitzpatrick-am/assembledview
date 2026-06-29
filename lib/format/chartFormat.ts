export const formatNumberAU = (value: number) =>
  new Intl.NumberFormat("en-AU").format(Number(value) || 0)

export const formatPercentage = (value: number, digits = 1) =>
  `${(Number(value) || 0).toFixed(digits)}%`
