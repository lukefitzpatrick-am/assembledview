/**
 * Plan C S2b — NEXT_PUBLIC_PLANC_BALANCER gate (client-only).
 */

export type PlanCBalancerMode = "off" | "on"

export function resolvePlanCBalancerMode(
  raw: string | undefined = process.env.NEXT_PUBLIC_PLANC_BALANCER
): PlanCBalancerMode {
  const v = String(raw ?? "")
    .trim()
    .toLowerCase()
  return v === "on" || v === "1" || v === "true" ? "on" : "off"
}

export function isPlanCBalancerEnabled(
  raw?: string
): boolean {
  return resolvePlanCBalancerMode(raw) === "on"
}
