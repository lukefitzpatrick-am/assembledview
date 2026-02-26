export function slugifyClientNameForUrl(value: unknown): string {
  const s = String(value ?? "").trim().toLowerCase()
  if (!s) return ""
  const canonicalKey = s
    .replace(/&/g, "and")
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  // Temporary override(s) for known client slug mismatches.
  if (canonicalKey === "legalsuper" || canonicalKey === "legal super") {
    return "legal_super"
  }

  return canonicalKey
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/(^-|-$)+/g, "")
}

export function getClientDisplayName(raw: any): string {
  const name = String(
    raw?.mp_client_name ??
      raw?.client_name ??
      raw?.clientname_input ??
      raw?.name ??
      ""
  ).trim()

  // Temporary display name override(s).
  const compact = name.toLowerCase().replace(/[^a-z0-9]+/g, "")
  if (compact === "legalsuper") return "Legal Super"

  return name
}

