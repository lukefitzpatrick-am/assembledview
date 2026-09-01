/**
 * Contact → client resolution helpers.
 * Strip corporate suffixes then match clients.mp_client_name; alias table is fallback.
 * Learned `xero_contact_links` (by xero_contact_id, then by normalised name key) win.
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

export type ContactLinkRow = {
  xeroContactKey: string
  clientId: number
}

export type ResolveClientOptions = {
  xeroContactId?: string | null
  links?: ContactLinkRow[]
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

function clientById(clients: ClientRow[], id: number): ClientRow | undefined {
  return clients.find((c) => c.id === id)
}

function linkedClientId(
  contactName: string,
  options?: ResolveClientOptions,
): number | null {
  const links = options?.links ?? []
  if (links.length === 0) return null

  const contactId = String(options?.xeroContactId ?? "").trim()
  if (contactId) {
    const byId = links.find((l) => l.xeroContactKey === contactId)
    if (byId) return byId.clientId
  }

  const normContact = normalizeContactKey(contactName)
  if (!normContact) return null
  const byName = links.find((l) => {
    if (l.xeroContactKey === normContact) return true
    return normalizeContactKey(l.xeroContactKey) === normContact
  })
  return byName ? byName.clientId : null
}

function nameMatchClientIds(
  contactName: string,
  clients: ClientRow[],
): number[] {
  const normContact = normalizeContactKey(contactName)
  if (!normContact) return []
  const ids: number[] = []
  for (const cl of clients) {
    const normClient = normalizeContactKey(cl.mp_client_name ?? "")
    if (normClient && normContact === normClient) ids.push(cl.id)
  }
  return [...new Set(ids)]
}

/**
 * AR → client identity. One resolver for import, coverage, and tests.
 *
 * 1) xero_contact_links by xero_contact_id (GUID stored as xero_contact_key)
 * 2) xero_contact_links by normalised name key (PC6 reassign rows)
 * 3) unique normalised contact vs mp_client_name — 2+ matches stay unresolved
 * 4) alias by raw lower(trim) contact_key, then by normalised contact_key
 */
export function resolveClientFromContact(
  contactName: string,
  clients: ClientRow[],
  aliases: AliasRow[],
  options?: ResolveClientOptions,
): ResolvedClient {
  const linkedId = linkedClientId(contactName, options)
  if (linkedId != null) {
    const cl = clientById(clients, linkedId)
    if (cl) return fromClient(cl, contactName)
  }

  const nameIds = nameMatchClientIds(contactName, clients)
  if (nameIds.length === 1) {
    const cl = clientById(clients, nameIds[0]!)
    if (cl) return fromClient(cl, contactName)
  }
  if (nameIds.length >= 2) {
    return {
      ...UNRESOLVED,
      clientName: contactName,
    }
  }

  const rawKey = contactName.toLowerCase().trim()
  const normContact = normalizeContactKey(contactName)
  const aliasByRaw = aliases.find((a) => a.contact_key === rawKey)
  const aliasByNorm =
    aliasByRaw ?? aliases.find((a) => a.contact_key === normContact)
  if (aliasByNorm) {
    const cl = clientById(clients, aliasByNorm.client_id)
    if (cl) return fromClient(cl, contactName)
  }

  return {
    ...UNRESOLVED,
    clientName: contactName,
  }
}
