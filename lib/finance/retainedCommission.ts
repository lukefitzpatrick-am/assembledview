/**
 * Retained publisher commission after Advertising Associates (AA) take.
 *
 * Decision 6 Aug 2026: retained = max(0, rate − AA) percent of GROSS media.
 * A publisher at 0% commission earns nothing and pays nothing — never negative.
 */

/** AA takes 2% of gross media, fixed for all publishers. */
export const AA_COMMISSION_RATE = 2

export type RetainedCommissionLogContext = {
  publisher?: string | null
  lineItemId?: string | null
}

/**
 * Retained commission rate in whole percent points after the AA take.
 * Clamp only — does not apply to dollars; does not know about client-pays.
 */
export function retainedCommissionRate(
  rate: number,
  ctx?: RetainedCommissionLogContext
): number {
  const n = Number(rate)
  if (!Number.isFinite(n)) return 0
  const retained = Math.max(0, n - AA_COMMISSION_RATE)
  // Clamp fires when rate < AA (includes rate 0 = "not set"). Boundary rate===2
  // yields retained 0 without Math.max changing the value — no warning there.
  if (n < AA_COMMISSION_RATE) {
    console.warn("[retained-commission-zero-aa]", {
      message:
        "publisher commission rate below AA take — retained clamped to 0 (rate 0 means not set, not a zero-commission deal)",
      rate: n,
      retained,
      aaTake: AA_COMMISSION_RATE,
      publisher: ctx?.publisher ?? null,
      lineItemId: ctx?.lineItemId ?? null,
    })
  }
  return retained
}
