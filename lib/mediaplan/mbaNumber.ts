import { NextResponse } from "next/server"

/** Canonical MBA identifier: alphanumeric only (no path or URL metacharacters). */
export const MBA_NUMBER_PATTERN = /^[A-Za-z0-9]+$/

export function parseMbaNumber(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null
  const trimmed = String(raw).trim()
  if (!trimmed || !MBA_NUMBER_PATTERN.test(trimmed)) return null
  return trimmed
}

/**
 * Case-insensitive join key for MBA maps. Does not rewrite stored or displayed
 * `mba_number` — only the in-memory lookup key.
 */
export function mbaJoinKey(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null
  const s = String(raw).trim().toLowerCase()
  return s.length > 0 ? s : null
}

export function invalidMbaNumberResponse() {
  return NextResponse.json({ error: "Invalid MBA number" }, { status: 400 })
}
