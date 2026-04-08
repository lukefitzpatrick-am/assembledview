/** Validates `av_line_item_code` when `match_type` is `suffix_id` (alphanumeric, 1–64, no hyphens). */
export function validateSuffixIdLineItemCode(raw: string): string | null {
  const t = raw.trim()
  if (!t) return "Line item code is required."
  if (t.includes("-")) {
    return "Codes can't contain hyphens — that's the separator we match on."
  }
  if (t.length > 64) return "Code must be at most 64 characters."
  if (!/^[a-zA-Z0-9]+$/.test(t)) {
    return "Code must be alphanumeric only (no spaces or special characters)."
  }
  return null
}
