/**
 * Xero AP amounts compared to booked delivery media (ex-GST).
 * Xero Total is GST-inclusive; Delta / Unbilled accrual use sub_total.
 */

export function xeroApExGstCents(subTotal: unknown): number {
  if (subTotal == null) return 0
  const n = typeof subTotal === "number" ? subTotal : Number(String(subTotal))
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100)
}

export function costsDeltaCents(bookedCents: number, apBilledCents: number): number {
  return bookedCents - apBilledCents
}
