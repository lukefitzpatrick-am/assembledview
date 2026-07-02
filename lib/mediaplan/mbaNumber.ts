import { NextResponse } from "next/server"

/** Canonical MBA identifier: alphanumeric only (no path or URL metacharacters). */
export const MBA_NUMBER_PATTERN = /^[A-Za-z0-9]+$/

export function parseMbaNumber(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null
  const trimmed = String(raw).trim()
  if (!trimmed || !MBA_NUMBER_PATTERN.test(trimmed)) return null
  return trimmed
}

export function invalidMbaNumberResponse() {
  return NextResponse.json({ error: "Invalid MBA number" }, { status: 400 })
}
