const numberFmt = new Intl.NumberFormat("en-AU", { maximumFractionDigits: 0 })

const moneyFmt = new Intl.NumberFormat("en-AU", {
  maximumFractionDigits: 0,
})

export function fmtInt(value: number): string {
  if (!Number.isFinite(value)) return "—"
  return numberFmt.format(Math.round(value))
}

export function fmtMoney(value: number): string {
  if (!Number.isFinite(value)) return "—"
  return `$${moneyFmt.format(Math.round(value))}`
}

export function fmtMultiple(value: number): string {
  if (!Number.isFinite(value)) return "—"
  return `${value.toFixed(value >= 10 ? 0 : 1)}×`
}
