/**
 * C-150. Billing records imported from Xero for FY26 (Jul 2025 to Jul 2026)
 * carry `exported_at = 1970-01-01` and `exported_by = 0`: they were billed
 * before AssembledView existed. They are not "sent to finance".
 *
 * Never null these stamps: that would drop all 443 rows to "ready" in
 * `resolveBillingState`. Read them through this predicate instead.
 * Pure: no db, no server-only.
 */

/** Epoch milliseconds for a stamp in any shape the readers see, or null. */
function stampMs(value: unknown): number | null {
  if (value == null || value === "") return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime()
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  const s = String(value).trim()
  if (!s) return null
  // Postgres text form "1970-01-01 00:00:00+00": a T for the space, and +00 as +00:00.
  const iso = (/^\d{4}-\d{2}-\d{2} /.test(s) ? s.replace(" ", "T") : s).replace(/([+-]\d{2})$/, "$1:00")
  const t = Date.parse(iso)
  return Number.isNaN(t) ? null : t
}

/** True only for the pre-AssembledView stamp: exported_at is the epoch AND exported_by is 0. */
export function isLegacyExportStamp(exportedAt: unknown, exportedBy: unknown): boolean {
  if (exportedBy == null || exportedBy === "") return false
  if (Number(exportedBy) !== 0) return false
  return stampMs(exportedAt) === 0
}

export const LEGACY_BILLED_LABEL = "Billed before AssembledView"
