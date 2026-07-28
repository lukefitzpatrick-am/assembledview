/**
 * Plan C S2-P5 — client address resolution for MBA docs.
 *
 * Versions / masters may carry `clients_id` | `mp_clients_id` | `client_id`
 * (same aliases finance hub already uses). When PLANC_READ_ROWS_DOCS is on,
 * prefer id lookup and do not rely on by-name as the primary path.
 */

export type ClientAddressFields = {
  streetaddress?: string
  suburb?: string
  state?: string
  postcode?: string
}

export function pickClientIdFromPlanRecord(
  record: Record<string, unknown> | null | undefined
): number {
  if (!record) return 0
  return (
    Number(record.clients_id ?? record.mp_clients_id ?? record.client_id ?? 0) || 0
  )
}

function addressFromClientRow(hit: Record<string, unknown>): ClientAddressFields {
  return {
    streetaddress: String(
      hit.streetaddress ?? hit.street_address ?? hit.address ?? ""
    ),
    suburb: String(hit.suburb ?? ""),
    state: String(hit.state ?? ""),
    postcode: String(hit.postcode ?? hit.post_code ?? ""),
  }
}

export function matchClientAddressById(
  clients: Record<string, unknown>[],
  clientsId: number
): ClientAddressFields | null {
  if (!Number.isFinite(clientsId) || clientsId <= 0) return null
  const hit = clients.find((c) => Number(c.id) === clientsId)
  return hit ? addressFromClientRow(hit) : null
}

export function matchClientAddressByName(
  clients: Record<string, unknown>[],
  clientName: string
): ClientAddressFields | null {
  const target = clientName.trim().toLowerCase()
  if (!target) return null
  const hit = clients.find((c) => {
    const names = [c.clientname_input, c.client_name, c.name, c.mp_client_name]
      .filter(Boolean)
      .map((n) => String(n).trim().toLowerCase())
    return names.includes(target)
  })
  return hit ? addressFromClientRow(hit) : null
}

/**
 * @param preferId — when true (docs rows flag on), id lookup is required path;
 *   by-name is only used if no id is present on version/master (one-shot resolve).
 */
export function resolveMbaClientAddress(args: {
  clients: Record<string, unknown>[]
  version: Record<string, unknown>
  master?: Record<string, unknown> | null
  clientName: string
  preferId: boolean
}): { address: ClientAddressFields | null; resolvedVia: "id" | "name" | "none"; clientsId: number } {
  const fromVersion = pickClientIdFromPlanRecord(args.version)
  const fromMaster = pickClientIdFromPlanRecord(args.master)
  const clientsId = fromVersion || fromMaster

  if (clientsId > 0) {
    const byId = matchClientAddressById(args.clients, clientsId)
    if (byId) return { address: byId, resolvedVia: "id", clientsId }
    // Id present but no client row — do not fall back to name when preferId
    if (args.preferId) {
      return { address: null, resolvedVia: "none", clientsId }
    }
  }

  if (args.preferId && clientsId <= 0) {
    // Flag on but no id stamped: one-shot name resolve (report via resolvedVia)
    const byName = matchClientAddressByName(args.clients, args.clientName)
    return {
      address: byName,
      resolvedVia: byName ? "name" : "none",
      clientsId: 0,
    }
  }

  const byName = matchClientAddressByName(args.clients, args.clientName)
  return {
    address: byName,
    resolvedVia: byName ? "name" : "none",
    clientsId,
  }
}
