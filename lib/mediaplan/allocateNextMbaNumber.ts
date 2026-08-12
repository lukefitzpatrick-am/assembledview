import { mbaNumberMatchesClientIdentifier } from "@/lib/auth/mbaNumberMatchesClientIdentifier"

/**
 * Next MBA number for a client identifier.
 * Scopes existing plans with {@link mbaNumberMatchesClientIdentifier} (same boundary
 * as auth), takes the full trailing digit run (not slice(-3)), and always lowercases.
 */
export function allocateNextMbaNumber(
  existingMbaNumbers: readonly (string | null | undefined)[],
  mbaidentifier: string
): string {
  const id = String(mbaidentifier ?? "").trim()
  if (!id) {
    throw new Error("MBA Identifier is required")
  }

  let maxNumber = 0
  for (const raw of existingMbaNumbers) {
    if (typeof raw !== "string") continue
    if (!mbaNumberMatchesClientIdentifier(raw, id)) continue
    // Matcher guarantees ^id\d+$ (case-insensitive); suffix is everything after the id chars.
    const suffix = raw.slice(id.length)
    const numberPart = Number.parseInt(suffix, 10)
    if (!Number.isNaN(numberPart) && numberPart > maxNumber) {
      maxNumber = numberPart
    }
  }

  const next = maxNumber + 1
  return `${id.toLowerCase()}${String(next).padStart(3, "0")}`
}
