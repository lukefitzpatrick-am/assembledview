/**
 * Short-form roster alias: first.last@domain → first@domain.
 * Applied on create only (0039 generalised beyond the assembledmedia first-name list).
 */
const FIRST_LAST_EMAIL =
  /^([a-z]+)\.([a-z]+)@([^@\s]+)$/

export function shortFormEmailAlias(email: string): string | null {
  const normalised = email.trim().toLowerCase()
  if (!normalised) return null
  const match = FIRST_LAST_EMAIL.exec(normalised)
  if (!match) return null
  const first = match[1]
  const domain = match[3]
  if (!first || !domain) return null
  const alias = `${first}@${domain}`
  return alias === normalised ? null : alias
}
