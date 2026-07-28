/**
 * Classify a raw billing/delivery schedule field before normalizeBillingScheduleToArray.
 * Distinguishes {} / [] / "" / absent — all of which normalise to null.
 */

export type ScheduleShape =
  | "absent"
  | "empty-string"
  | "empty-object"
  | "empty-array"
  | "unparseable"
  | `array(${number})`

/**
 * Derive shape from the RAW version field (pre-normalise).
 * Do not change normalizeBillingScheduleToArray — it correctly maps all empty forms to null.
 */
export function classifyScheduleShape(raw: unknown): ScheduleShape {
  if (raw == null) return "absent"
  if (typeof raw === "string") {
    const t = raw.trim()
    if (!t) return "empty-string"
    try {
      return classifyScheduleShape(JSON.parse(t) as unknown)
    } catch {
      return "unparseable"
    }
  }
  if (Array.isArray(raw)) {
    return raw.length === 0 ? "empty-array" : `array(${raw.length})`
  }
  if (typeof raw === "object") {
    const months = (raw as { months?: unknown }).months
    if (Array.isArray(months)) {
      return months.length === 0 ? "empty-array" : `array(${months.length})`
    }
    return "empty-object"
  }
  return "unparseable"
}

/** Shapes that mean "no usable schedule blob" (before cross-side substitution). */
export function isEmptyScheduleShape(shape: ScheduleShape): boolean {
  return (
    shape === "absent" ||
    shape === "empty-string" ||
    shape === "empty-array" ||
    shape === "empty-object"
  )
}

export function isPopulatedArrayShape(shape: ScheduleShape): boolean {
  return shape.startsWith("array(")
}

/**
 * One side empty, the other array(n) — financialsFromPersistedSchedules will
 * substitute, fabricating rows on the empty side from the populated one.
 */
export function isScheduleFallbackPair(
  billingShape: ScheduleShape,
  deliveryShape: ScheduleShape
): boolean {
  return (
    (isEmptyScheduleShape(billingShape) && isPopulatedArrayShape(deliveryShape)) ||
    (isPopulatedArrayShape(billingShape) && isEmptyScheduleShape(deliveryShape))
  )
}
