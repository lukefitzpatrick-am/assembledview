/**
 * Canonical finance field normaliser.
 *
 * Incoming Xano / version / line-item records use mixed snake_case and camelCase.
 * This module maps those aliases onto ONE camelCase set. Callers should prefer these
 * helpers over reading aliases inline. Remaining raw alias sites are marked
 * `TODO(phase-3-normalizeFields)` for migration.
 */

export type CanonicalFinanceFields = {
  clientPaysForMedia: boolean
  budgetIncludesFees: boolean
  /** Raw billing schedule payload (`billingSchedule` | `billing_schedule`), unparsed. */
  billingSchedule: unknown
  /** Raw delivery schedule payload (`deliverySchedule` | `delivery_schedule`), unparsed. */
  deliverySchedule: unknown
}

function asRecord(raw: unknown): Record<string, unknown> | null {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>
  }
  return null
}

/** First value that is not `undefined` / `null`. */
function firstDefined(...values: unknown[]): unknown {
  for (const v of values) {
    if (v !== undefined && v !== null) return v
  }
  return undefined
}

/**
 * Coerce to boolean. Strict `true` / `"true"` → true; everything else → false
 * (matches prior delivery-schedule payables + report-line behaviour).
 */
function asBool(value: unknown): boolean {
  if (value === true) return true
  if (typeof value === "string") return value.trim().toLowerCase() === "true"
  return false
}

/**
 * Canonical `clientPaysForMedia` from:
 * `clientPaysForMedia` | `client_pays_for_media` | `client_pays_media`
 */
export function normalizeClientPaysForMedia(raw: unknown): boolean {
  const r = asRecord(raw)
  if (!r) return false
  return asBool(
    firstDefined(r.clientPaysForMedia, r.client_pays_for_media, r.client_pays_media)
  )
}

/**
 * Canonical `budgetIncludesFees` from:
 * `budgetIncludesFees` | `budget_includes_fees`
 */
export function normalizeBudgetIncludesFees(raw: unknown): boolean {
  const r = asRecord(raw)
  if (!r) return false
  return asBool(firstDefined(r.budgetIncludesFees, r.budget_includes_fees))
}

/** Schedule accessor: `billingSchedule` | `billing_schedule`. */
export function getBillingSchedule(raw: unknown): unknown {
  const r = asRecord(raw)
  if (!r) return null
  return firstDefined(r.billingSchedule, r.billing_schedule) ?? null
}

/** Schedule accessor: `deliverySchedule` | `delivery_schedule`. */
export function getDeliverySchedule(raw: unknown): unknown {
  const r = asRecord(raw)
  if (!r) return null
  return firstDefined(r.deliverySchedule, r.delivery_schedule) ?? null
}

/**
 * Single normaliser — maps an incoming record to the canonical camelCase set.
 */
export function normalizeFinanceFields(raw: unknown): CanonicalFinanceFields {
  return {
    clientPaysForMedia: normalizeClientPaysForMedia(raw),
    budgetIncludesFees: normalizeBudgetIncludesFees(raw),
    billingSchedule: getBillingSchedule(raw),
    deliverySchedule: getDeliverySchedule(raw),
  }
}
