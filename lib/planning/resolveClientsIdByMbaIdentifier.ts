/**
 * Map an MBA to Xano `clients.id` via longest `mbaidentifier` prefix match
 * (e.g. mba `krusty006` → client with mbaidentifier `krusty`).
 * Xano `GET planning_audiences` requires `clients_id`; mba alone is rejected.
 */
export function resolveClientsIdByMbaIdentifier(
  mbaNumber: string,
  clients: Array<{ id?: unknown; mbaidentifier?: unknown }>
): number | null {
  const needle = mbaNumber.trim().toLowerCase()
  if (!needle) return null
  let best: { id: number; len: number } | null = null
  for (const row of clients) {
    const id = Number(row.id)
    if (!Number.isFinite(id) || id <= 0) continue
    const prefix = String(row.mbaidentifier ?? "").trim().toLowerCase()
    if (!prefix || !needle.startsWith(prefix)) continue
    if (!best || prefix.length > best.len) {
      best = { id, len: prefix.length }
    }
  }
  return best?.id ?? null
}
