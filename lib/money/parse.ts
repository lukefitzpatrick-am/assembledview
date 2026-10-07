/**
 * One sign-safe money parser. Never returns NaN.
 * Parentheses and a leading minus are negative. Empty and "-" are null.
 */

export function parseMoney(input: unknown): number | null {
  if (typeof input === "number") return Number.isFinite(input) ? input : null
  if (typeof input !== "string") return null

  const trimmed = input.trim()
  if (trimmed === "" || trimmed === "-") return null

  let body = trimmed.replace(/AUD/gi, "").replace(/[$,\s]/g, "")
  if (body === "" || body === "-") return null

  let negative = false
  if (body.startsWith("(") && body.endsWith(")")) {
    negative = true
    body = body.slice(1, -1)
  }
  if (body.startsWith("-")) {
    negative = true
    body = body.slice(1)
  }
  if (!/^\d+(\.\d+)?$/.test(body)) return null

  const value = Number(body)
  if (!Number.isFinite(value)) return null
  const signed = negative ? -value : value
  return signed === 0 ? 0 : signed
}
