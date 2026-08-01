export function formatReportMoney(n: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(Math.round(n))
}

export function formatReportInt(n: number): string {
  return new Intl.NumberFormat("en-AU", { maximumFractionDigits: 0 }).format(Math.round(n))
}
