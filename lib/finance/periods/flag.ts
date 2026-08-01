/**
 * PC5 — FINANCE_PERIODS flag.
 * off (default) | shadow (periods/runs real, lock advisory, hub still PC1 derive) | on
 */

export type FinancePeriodsMode = "off" | "shadow" | "on"

export function getFinancePeriodsMode(): FinancePeriodsMode {
  const v = (process.env.FINANCE_PERIODS ?? "off").trim().toLowerCase()
  if (v === "on" || v === "1" || v === "true") return "on"
  if (v === "shadow") return "shadow"
  return "off"
}

export function isFinancePeriodsEnabled(): boolean {
  const m = getFinancePeriodsMode()
  return m === "shadow" || m === "on"
}

/** Lock writes for real; shadow only advises. */
export function isFinancePeriodsLockEnforced(): boolean {
  return getFinancePeriodsMode() === "on"
}
