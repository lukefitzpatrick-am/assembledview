/**
 * Learned Xero contact → client mappings (xero_contact_links).
 * AR identity keys on xero_contacts.xero_contact_id stored as xero_contact_key.
 * PC6 reassign still writes normalised-name keys; the resolver accepts both.
 */

import "server-only"

import { sql } from "drizzle-orm"

import { getDb } from "@/db"
import { parseXeroInvoiceIdFromKey } from "@/lib/xero/billingStatus"
import { rowsOf } from "@/lib/xero/dbRows"
import {
  resolveClientFromContact,
  type AliasRow,
  type ClientRow,
  type ContactLinkRow,
} from "@/lib/xero/normalizeContact"

export const ASSIGN_CLIENT_LEARNED_FROM = "assign_client"
export const FY26_AR_START = "2025-07-01"

export type ContactLinkStoreRow = {
  xeroContactKey: string
  clientId: number
  learnedFrom: string | null
}

/** ON CONFLICT (xero_contact_key) DO UPDATE — used by tests and the SQL upsert. */
export function applyContactLinkUpsert(
  rows: ContactLinkStoreRow[],
  next: ContactLinkStoreRow,
): ContactLinkStoreRow[] {
  const i = rows.findIndex((r) => r.xeroContactKey === next.xeroContactKey)
  if (i < 0) return [...rows, next]
  return rows.map((r, idx) => (idx === i ? { ...r, ...next } : r))
}

export async function loadContactLinks(): Promise<ContactLinkRow[]> {
  const db = getDb()
  try {
    return rowsOf<{ xero_contact_key: string; client_id: number }>(
      await db.execute(
        sql`SELECT xero_contact_key, client_id FROM xero_contact_links`,
      ),
    ).map((r) => ({
      xeroContactKey: String(r.xero_contact_key),
      clientId: Number(r.client_id),
    }))
  } catch {
    return []
  }
}

type SqlTx = {
  execute: (query: ReturnType<typeof sql>) => Promise<unknown>
}

export async function upsertXeroContactLinkInTx(
  tx: SqlTx,
  args: {
    xeroContactKey: string
    clientId: number
    learnedFrom: string
  },
): Promise<void> {
  const key = args.xeroContactKey.trim()
  if (!key) return
  await tx.execute(sql`
    INSERT INTO xero_contact_links (xero_contact_key, client_id, learned_from, updated_at)
    VALUES (${key}, ${args.clientId}, ${args.learnedFrom}, now())
    ON CONFLICT (xero_contact_key) DO UPDATE SET
      client_id = EXCLUDED.client_id,
      learned_from = EXCLUDED.learned_from,
      updated_at = now()
  `)
}

export async function upsertXeroContactLink(args: {
  xeroContactKey: string
  clientId: number
  learnedFrom: string
}): Promise<void> {
  const db = getDb()
  await db.transaction(async (tx) => {
    await upsertXeroContactLinkInTx(tx, args)
  })
}

export type AssignClientAndLearnResult = {
  learned: boolean
  xeroContactId: string | null
}

/**
 * Stamp the billing row's client and, when the invoice has a Xero contact,
 * upsert xero_contact_links in the same transaction.
 */
export async function assignClientAndLearnLink(args: {
  billingRecordId: number
  clientsId: number
  clientName: string
  learnedFrom?: string
}): Promise<AssignClientAndLearnResult> {
  const db = getDb()
  const learnedFrom = args.learnedFrom ?? ASSIGN_CLIENT_LEARNED_FROM

  const record = rowsOf<{
    id: number
    invoice_key: string | null
  }>(
    await db.execute(sql`
      SELECT id, invoice_key
      FROM finance_billing_records
      WHERE id = ${args.billingRecordId}
      LIMIT 1
    `),
  )[0]
  if (!record) {
    throw new Error(`finance_billing_records id ${args.billingRecordId} not found`)
  }

  const xeroInvoiceId = parseXeroInvoiceIdFromKey(record.invoice_key)
  let xeroContactId: string | null = null
  if (xeroInvoiceId) {
    const ar = rowsOf<{ xero_contact_id: string | null }>(
      await db.execute(sql`
        SELECT xero_contact_id
        FROM xero_ar_invoices
        WHERE xero_invoice_id = ${xeroInvoiceId}
        LIMIT 1
      `),
    )[0]
    const cid = String(ar?.xero_contact_id ?? "").trim()
    xeroContactId = cid || null
  }

  await db.transaction(async (tx) => {
    if (xeroContactId) {
      await upsertXeroContactLinkInTx(tx, {
        xeroContactKey: xeroContactId,
        clientId: args.clientsId,
        learnedFrom,
      })
    }
    await tx.execute(sql`
      UPDATE finance_billing_records
      SET
        clients_id = ${args.clientsId},
        client_name = ${args.clientName},
        updated_at = now()
      WHERE id = ${args.billingRecordId}
    `)
  })

  return { learned: xeroContactId != null, xeroContactId }
}

export type Fy26ArClientCoverage = {
  resolved: number
  total: number
}

export async function countFy26ArClientCoverage(): Promise<Fy26ArClientCoverage> {
  const db = getDb()

  const [clients, aliases, links, contacts, ar] = await Promise.all([
    rowsOf<{
      id: number
      mp_client_name: string | null
      payment_days: number | null
      payment_terms: string | null
    }>(
      await db.execute(
        sql`SELECT id, mp_client_name, payment_days, payment_terms FROM clients`,
      ),
    ),
    rowsOf<{ contact_key: string; client_id: number }>(
      await db
        .execute(sql`SELECT contact_key, client_id FROM xero_client_aliases`)
        .catch(() => [] as { contact_key: string; client_id: number }[]),
    ),
    loadContactLinks(),
    rowsOf<{ xero_contact_id: string; name: string | null }>(
      await db.execute(sql`SELECT xero_contact_id, name FROM xero_contacts`),
    ),
    rowsOf<{ xero_contact_id: string | null }>(
      await db.execute(sql`
        SELECT xero_contact_id
        FROM xero_ar_invoices
        WHERE issue_date >= ${FY26_AR_START}
      `),
    ),
  ])

  const clientRows: ClientRow[] = clients.map((c) => ({
    id: Number(c.id),
    mp_client_name: c.mp_client_name,
    payment_days: c.payment_days != null ? Number(c.payment_days) : null,
    payment_terms: c.payment_terms,
  }))
  const aliasRows: AliasRow[] = aliases.map((a) => ({
    contact_key: a.contact_key,
    client_id: Number(a.client_id),
  }))
  const nameByContactId = new Map<string, string>()
  for (const c of contacts) {
    nameByContactId.set(c.xero_contact_id, c.name ?? "")
  }

  let resolved = 0
  for (const inv of ar) {
    const contactId = inv.xero_contact_id
    const contactName = (contactId && nameByContactId.get(contactId)) || ""
    const r = resolveClientFromContact(contactName, clientRows, aliasRows, {
      xeroContactId: contactId,
      links,
    })
    if (r.resolved) resolved += 1
  }

  return { resolved, total: ar.length }
}
