/**
 * Plan C S2-P5 — per-surface flags for reading plan_*_rows.
 *
 * A version without billing_rows_migrated ALWAYS falls back to blobs,
 * regardless of flag.
 */

export type PlanCReadRowsSurface = "finance" | "pacing" | "export" | "docs"

export type PlanCReadRowsMode = "off" | "on"

const ENV_KEYS: Record<PlanCReadRowsSurface, string> = {
  finance: "PLANC_READ_ROWS_FINANCE",
  pacing: "PLANC_READ_ROWS_PACING",
  export: "PLANC_READ_ROWS_EXPORT",
  docs: "PLANC_READ_ROWS_DOCS",
}

export function resolvePlanCReadRowsMode(
  surface: PlanCReadRowsSurface,
  raw?: string
): PlanCReadRowsMode {
  const envKey = ENV_KEYS[surface]
  const v = String(raw ?? process.env[envKey] ?? "")
    .trim()
    .toLowerCase()
  return v === "on" || v === "1" || v === "true" ? "on" : "off"
}

export function isBillingRowsMigrated(version: Record<string, unknown> | null | undefined): boolean {
  if (!version || typeof version !== "object") return false
  const v = version.billing_rows_migrated ?? version.billingRowsMigrated
  return v === true || v === "true" || v === 1 || v === "1"
}

/**
 * True only when the surface flag is on AND the version has been migrated.
 */
export function shouldReadPlanRows(
  surface: PlanCReadRowsSurface,
  version: Record<string, unknown> | null | undefined
): boolean {
  return resolvePlanCReadRowsMode(surface) === "on" && isBillingRowsMigrated(version)
}

/** Symbols / keys attached onto version objects after async hydrate. */
export const PLANC_ATTACHED_BILLING_MONTHS = "__planCBillingMonths"
export const PLANC_ATTACHED_DELIVERY_MONTHS = "__planCDeliveryMonths"
export const PLANC_ATTACHED_ROWS_CHECKSUM = "__planCRowsChecksum"
