/**
 * Plan-side client slug. Different from `lib/clients/slug`.
 * Keep this file free of I/O and `server-only` — channel cards import it.
 */
export function slugifyPlanClientName(value: unknown): string {
  const s = String(value ?? "").trim().toLowerCase()
  if (!s) return ""
  return s
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/(^-|-$)+/g, "")
}

export function clientNameFromGetClientsRow(raw: Record<string, unknown>): string {
  return String(
    raw?.mp_client_name ??
      raw?.client_name ??
      raw?.clientname_input ??
      raw?.name ??
      ""
  ).trim()
}

/** One Xano id per plan slug (first wins if duplicates). */
export function buildPlanSlugToClientIdMap(rows: Record<string, unknown>[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const raw of rows) {
    const id = Number(raw.id)
    if (!Number.isFinite(id)) continue
    const slug = slugifyPlanClientName(clientNameFromGetClientsRow(raw))
    if (!slug) continue
    if (!m.has(slug)) m.set(slug, id)
  }
  return m
}
