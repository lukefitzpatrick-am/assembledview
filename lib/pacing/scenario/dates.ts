import { computeDaysRemaining } from "@/lib/pacing/maths"

export function addCalendarDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map((part) => Number(part))
  const next = new Date(Date.UTC(y, m - 1, d + days))
  const yy = next.getUTCFullYear()
  const mm = String(next.getUTCMonth() + 1).padStart(2, "0")
  const dd = String(next.getUTCDate()).padStart(2, "0")
  return `${yy}-${mm}-${dd}`
}

export function burstDaysLeft(start: string, end: string, asOf: string): number {
  return computeDaysRemaining(start, end, asOf)
}
