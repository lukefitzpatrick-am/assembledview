/**
 * Escape a string for safe use inside a RegExp source.
 */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * Fallback MBA ↔ client identifier boundary match.
 * Requires identifier + ONE OR MORE trailing digits (e.g. PENFOLD001) — not bare startsWith.
 * Current MBA format is identifier+digits (PENFOLD001..021). If MBA numbers ever gain alpha
 * suffixes, this regex needs revisiting.
 */
export function mbaNumberMatchesClientIdentifier(
  mbaNumber: string,
  mbaidentifier: string | null | undefined
): boolean {
  const id = String(mbaidentifier ?? "").trim()
  if (!id) return false
  return new RegExp("^" + escapeRegExp(id) + "\\d+$", "i").test(mbaNumber)
}
