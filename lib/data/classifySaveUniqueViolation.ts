/**
 * Disambiguate Postgres 23505 by constraint name (not every unique is a line id).
 * - line_items_version_id_line_item_id_key → DUPLICATE_LINE_ITEM_ID
 * - media_plan_versions master/version unique → VERSION_ALREADY_EXISTS
 */
export function classifySaveUniqueViolation(err: unknown): {
  code: "DUPLICATE_LINE_ITEM_ID" | "VERSION_ALREADY_EXISTS" | "UNIQUE_VIOLATION"
  constraint: string | null
} {
  const e = (err ?? {}) as {
    constraint?: string
    cause?: { constraint?: string; message?: string }
    message?: string
  }
  const constraint = String(
    e.constraint ?? e.cause?.constraint ?? ""
  ).trim() || null
  const blob = [constraint, e.message, e.cause?.message]
    .filter(Boolean)
    .join("\n")

  if (
    /line_items_version_id_line_item_id/i.test(blob) ||
    (/line_items/i.test(blob) && /line_item_id/i.test(blob))
  ) {
    return { code: "DUPLICATE_LINE_ITEM_ID", constraint }
  }
  if (
    /media_plan_versions_master_id_version_number/i.test(blob) ||
    (/media_plan_versions/i.test(blob) && /version_number/i.test(blob)) ||
    (/master_id/i.test(blob) && /version_number/i.test(blob))
  ) {
    return { code: "VERSION_ALREADY_EXISTS", constraint }
  }
  return { code: "UNIQUE_VIOLATION", constraint }
}
