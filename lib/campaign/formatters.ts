import { format as formatDateFns } from "date-fns"

import { getPacingStatus, getPacingStatusColor } from "@/lib/campaign/pacingStatus"

export function formatCampaignCurrency(value: number, abbreviated = true): string {
  const safe = Number.isFinite(value) ? value : 0
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    notation: abbreviated ? "compact" : "standard",
    maximumFractionDigits: abbreviated ? 1 : 0,
  }).format(safe)
}

export function formatPacingPercentage(value: number): { text: string; colorClass: string } {
  const safe = Number.isFinite(value) ? value : 0
  const status = getPacingStatus(safe)
  return {
    text: `${safe.toFixed(1)}%`,
    colorClass: getPacingStatusColor(status),
  }
}

export function formatDateRange(start: string, end: string, pattern = "dd MMM yyyy"): string {
  const startDate = new Date(start)
  const endDate = new Date(end)
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return "Date range unavailable"
  }
  return `${formatDateFns(startDate, pattern)} - ${formatDateFns(endDate, pattern)}`
}

export function formatDaysRemaining(days: number): string {
  if (!Number.isFinite(days)) return "Unknown"
  if (days <= 0) return "Completed"
  if (days === 1) return "1 day left"
  return `${Math.round(days)} days left`
}

export function formatWholeNumber(value: number): string {
  const safe = Number.isFinite(value) ? value : 0
  return new Intl.NumberFormat("en-US").format(Math.round(safe))
}

export function formatDeliverables(value: number, type?: string): string {
  const count = formatWholeNumber(value)
  if (!type) return count
  const label = type.trim()
  if (!label) return count
  return `${count} ${label}`
}
