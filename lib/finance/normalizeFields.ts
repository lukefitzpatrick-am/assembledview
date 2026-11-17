
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
