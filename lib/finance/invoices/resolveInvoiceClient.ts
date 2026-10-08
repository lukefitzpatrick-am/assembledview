/**
 * One AR invoice → client resolver.
 * best_effort keeps the PDF chain: stored link, unique normalised name, alias,
 * then the MBA's client when the contact is still unresolved.
 * strict is for client-role callers: link, alias, or MBA. A name match is never used.
 */

import "server-only"

import { sql } from "drizzle-orm"

import { getDb } from "@/db"
import { mbaNumberMatchesClientIdentifier } from "@/lib/auth/mbaNumberMatchesClientIdentifier"
import { rowsOf } from "@/lib/xero/dbRows"
import { loadContactLinks } from "@/lib/xero/contactLinks"
import {
  contactHasStoredLink,
  resolveClientFromContact,
  suggestClientWithoutStoredLink,
  type AliasRow,
  type ClientRow,
  type ContactLinkRow,
} from "@/lib/xero/normalizeContact"

export type InvoiceClientVia = "link" | "alias" | "mba" | "fuzzy"

export type ResolvedInvoiceClient = {
  clientId: number
  via: InvoiceClientVia
}

export type InvoiceClientMode = "strict" | "best_effort"

export type InvoiceClientInput = {
  contactName?: string | null
  xeroContactId?: string | null
  mbaNumber?: string | null
}

export type MbaClientHint = {
  mbaNumber: string
  clientId: number
  mbaIdentifier: string | null
}

export type InvoiceClientContext = {
  clients: ClientRow[]
  aliases: AliasRow[]
  links: ContactLinkRow[]
  mbaClients: MbaClientHint[]
}

function clientFromStoredLink(
  contactName: string,
  xeroContactId: string,
  ctx: InvoiceClientContext,
): number | null {
  if (!contactHasStoredLink(contactName, xeroContactId, ctx.links)) return null
  const nameless = ctx.clients.map((client) => ({ ...client, mp_client_name: null }))
  const resolved = resolveClientFromContact(contactName, nameless, [], {
    xeroContactId,
    links: ctx.links,
  })
  if (!resolved.resolved || resolved.clientsId <= 0) return null
  return resolved.clientsId
}

function clientFromAlias(
  contactName: string,
  ctx: InvoiceClientContext,
): number | null {
  const nameless = ctx.clients.map((client) => ({ ...client, mp_client_name: null }))
  const hit = suggestClientWithoutStoredLink(contactName, nameless, ctx.aliases)
  if (!hit || hit.via !== "alias" || hit.clientId <= 0) return null
  return hit.clientId
}

function clientFromMba(mbaNumber: string | null | undefined, hints: MbaClientHint[]): number | null {
  const mba = (mbaNumber ?? "").trim()
  if (!mba) return null
  const ids = new Set<number>()
  for (const hint of hints) {
    if (hint.mbaNumber.trim().toLowerCase() !== mba.toLowerCase()) continue
    if (!mbaNumberMatchesClientIdentifier(mba, hint.mbaIdentifier)) continue
    if (!Number.isInteger(hint.clientId) || hint.clientId <= 0) continue
    ids.add(hint.clientId)
  }
  if (ids.size !== 1) return null
  return [...ids][0]!
}

export function resolveInvoiceClient(
  invoice: InvoiceClientInput,
  ctx: InvoiceClientContext,
  options: { mode: InvoiceClientMode },
): ResolvedInvoiceClient | null {
  const contactName = invoice.contactName ?? ""
  const xeroContactId = invoice.xeroContactId ?? ""

  const linkedId = clientFromStoredLink(contactName, xeroContactId, ctx)
  if (linkedId != null) return { clientId: linkedId, via: "link" }

  if (options.mode === "best_effort") {
    const named = suggestClientWithoutStoredLink(contactName, ctx.clients, ctx.aliases)
    if (named && named.clientId > 0) {
      return { clientId: named.clientId, via: named.via }
    }
  } else {
    const aliasId = clientFromAlias(contactName, ctx)
    if (aliasId != null) return { clientId: aliasId, via: "alias" }
  }

  const mbaId = clientFromMba(invoice.mbaNumber, ctx.mbaClients)
  if (mbaId != null) return { clientId: mbaId, via: "mba" }
  return null
}

async function loadInvoiceClientContext(): Promise<InvoiceClientContext> {
  const db = getDb()
  const [clients, aliases, links, masters] = await Promise.all([
    rowsOf<{
      id: number
      mp_client_name: string | null
      payment_days: number | null
      payment_terms: string | null
    }>(await db.execute(sql`SELECT id, mp_client_name, payment_days, payment_terms FROM clients`)),
    rowsOf<{ contact_key: string; client_id: number }>(
      await db
        .execute(sql`SELECT contact_key, client_id FROM xero_client_aliases`)
        .catch(() => [] as { contact_key: string; client_id: number }[]),
    ),
    loadContactLinks(),
    rowsOf<{
      mba_number: string | null
      client_id: number | null
      mbaidentifier: string | null
    }>(
      await db.execute(sql`
        SELECT m.mba_number, c.id AS client_id, c.mbaidentifier
        FROM media_plan_masters m
        INNER JOIN clients c ON c.id = m.client_id
        WHERE NULLIF(btrim(COALESCE(m.mba_number, '')), '') IS NOT NULL
      `),
    ),
  ])

  return {
    clients: clients.map((row) => ({
      id: Number(row.id),
      mp_client_name: row.mp_client_name,
      payment_days: row.payment_days != null ? Number(row.payment_days) : null,
      payment_terms: row.payment_terms,
    })),
    aliases: aliases.map((row) => ({
      contact_key: row.contact_key,
      client_id: Number(row.client_id),
    })),
    links,
    mbaClients: masters.flatMap((row) => {
      const mbaNumber = String(row.mba_number ?? "").trim()
      const clientId = Number(row.client_id)
      if (!mbaNumber || !Number.isInteger(clientId) || clientId <= 0) return []
      return [{ mbaNumber, clientId, mbaIdentifier: row.mbaidentifier }]
    }),
  }
}

/** Loads links, aliases, clients, and MBA owners once, then resolves each invoice. */
export async function resolveInvoiceClients(
  invoices: InvoiceClientInput[],
  options: { mode: InvoiceClientMode },
): Promise<Array<ResolvedInvoiceClient | null>> {
  if (invoices.length === 0) return []
  const ctx = await loadInvoiceClientContext()
  return invoices.map((invoice) => resolveInvoiceClient(invoice, ctx, options))
}
