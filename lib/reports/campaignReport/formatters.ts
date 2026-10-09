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

/** Null rates render as a dash. A real zero is $0.00. */
export const REPORT_FIGURE_DASH = "—"

export function formatReportRate(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return REPORT_FIGURE_DASH
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

/** CTR is stored as a decimal and shown as a percent only here. */
export function formatReportCtr(fraction: number | null): string {
  if (fraction == null || !Number.isFinite(fraction)) return REPORT_FIGURE_DASH
  return `${(fraction * 100).toFixed(2)}%`
}

/** Spend pace is stored as delivered / expected and shown as a percent only here. */
export function formatReportPace(fraction: number | null): string {
  if (fraction == null || !Number.isFinite(fraction)) return REPORT_FIGURE_DASH
  return `${(fraction * 100).toFixed(1)}%`
}
