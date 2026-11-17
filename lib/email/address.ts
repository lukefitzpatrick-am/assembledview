/**
 * Email address text (B49): one lower-case trimmed form and one display
 * name. Client-safe. Identity (aliases, primary address) stays in
 * `lib/codex/rosterResolve`.
 */

/** Trimmed and lower-cased; null and undefined become "". */
export function normaliseEmail(value: unknown): string {
  return String(value ?? "").trim().toLowerCase()
}

/** "mia.wong@x.au" → "Mia Wong". With no local part, the whole address is used. */
export function displayNameFromEmail(email: string | null | undefined): string {
  const address = normaliseEmail(email)
  const at = address.indexOf("@")
  return (at > 0 ? address.slice(0, at) : address)
    .split(/[._+-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}
