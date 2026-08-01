/**
 * Contact → client resolution helpers.
 * Strip corporate suffixes then match clients.mp_client_name; alias table is fallback.
 */

const SUFFIXES = [" pty ltd", " limited", " ltd", " australia"] as const

export function normalizeContactKey(name: string): string {
  let key = name.toLowerCase().trim()
  for (const suffix of SUFFIXES) {
    key = key.split(suffix).join("")
  }
  return key.trim()
}

export type ClientRow = {
  id: number
  mp_client_name: string | null
  payment_days?: number | null
  payment_terms?: string | null
}

export type AliasRow = {
  contact_key: string
  client_id: number
}

export type ResolvedClient = {
  clientsId: number
  clientName: string
  paymentDays: number
  paymentTerms: string
  resolved: boolean
}

const UNRESOLVED: ResolvedClient = {
  clientsId: 0,
  clientName: "",
  paymentDays: 14,
  paymentTerms: "",
  resolved: false,
}

function fromClient(
  cl: ClientRow,
  fallbackName: string,
): ResolvedClient {
  return {
    clientsId: cl.id,
    clientName: cl.mp_client_name ?? fallbackName,
    paymentDays: cl.payment_days ?? 14,
    paymentTerms: cl.payment_terms ?? "",
    resolved: true,
  }
}

/**
 * 1) normalised contact vs normalised mp_client_name
 * 2) alias by raw lower(trim) contact_key
 * 3) alias by normalised contact_key
 */
export function resolveClientFromContact(
  contactName: string,
  clients: ClientRow[],
  aliases: AliasRow[],
): ResolvedClient {
  const rawKey = contactName.toLowerCase().trim()
  const normContact = normalizeContactKey(contactName)

  if (normContact) {
    for (const cl of clients) {
      const normClient = normalizeContactKey(cl.mp_client_name ?? "")
      if (normClient && normContact === normClient) {
        return fromClient(cl, contactName)
      }
    }
  }

  const aliasByRaw = aliases.find((a) => a.contact_key === rawKey)
  const aliasByNorm =
    aliasByRaw ?? aliases.find((a) => a.contact_key === normContact)
  if (aliasByNorm) {
    const cl = clients.find((c) => c.id === aliasByNorm.client_id)
    if (cl) return fromClient(cl, contactName)
  }

  return {
    ...UNRESOLVED,
    clientName: contactName,
  }
}
