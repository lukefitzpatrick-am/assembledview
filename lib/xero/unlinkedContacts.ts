/**
 * FY26 AR contacts with no xero_contact_links row.
 * Suggestions are display only. Nothing is written until the manual link POST.
 */

import "server-only"

import { sql } from "drizzle-orm"

import { getDb } from "@/db"
import { mbaNumberMatchesClientIdentifier } from "@/lib/auth/mbaNumberMatchesClientIdentifier"
import { rowsOf } from "@/lib/xero/dbRows"
import { coerceDollars, dollarsToCents } from "@/lib/xero/money"
import {
  contactHasStoredLink,
  suggestClientWithoutStoredLink,
  type AliasRow,
  type ClientRow,
  type ContactLinkRow,
} from "@/lib/xero/normalizeContact"

import { FY26_AR_START, loadContactLinks } from "./contactLinks"

export type UnlinkedSuggestion = {
  clientId: number
  clientName: string
  via: "alias" | "fuzzy" | "mba"
}

export type UnlinkedContact = {
  xeroContactId: string
  contactName: string
  invoiceCount: number
  totalCents: number
  amountDueCents: number
  latestIssueDate: string
  suggestion: UnlinkedSuggestion | null
}

export type ContactLinkCoverage = {
  linked: number
  total: number
  hiddenInvoiceCount: number
}

export type UnlinkedContactsPayload = {
  contacts: UnlinkedContact[]
  coverage: ContactLinkCoverage
}

export type UnlinkedInvoiceInput = {
  xeroContactId: string
  contactName: string
  totalDollars: number
  amountDueDollars: number
  issueDate: string
  mbaNumber: string | null
}

export type MbaClientHint = {
  mbaNumber: string
  clientId: number
  clientName: string
  mbaIdentifier: string | null
}

function latestName(rows: UnlinkedInvoiceInput[]): string {
  const sorted = rows.toSorted((a, b) => b.issueDate.localeCompare(a.issueDate))
  for (const row of sorted) {
    const name = row.contactName.trim()
    if (name) return name
  }
  return ""
}

function suggestMbaClient(
  mbaNumbers: string[],
  hints: MbaClientHint[],
): { clientId: number; clientName: string } | null {
  const byMba = new Map<string, MbaClientHint[]>()
  for (const hint of hints) {
    const key = hint.mbaNumber.trim().toLowerCase()
    if (!key || !Number.isInteger(hint.clientId) || hint.clientId <= 0) continue
    const list = byMba.get(key) ?? []
    list.push(hint)
    byMba.set(key, list)
  }

  const clientIds = new Set<number>()
  let clientName = ""
  let sawMba = false
  for (const raw of mbaNumbers) {
    const trimmed = raw.trim()
    if (!trimmed) continue
    sawMba = true
    const matches = (byMba.get(trimmed.toLowerCase()) ?? []).filter((hint) =>
      mbaNumberMatchesClientIdentifier(trimmed, hint.mbaIdentifier),
    )
    const ids = [...new Set(matches.map((hint) => hint.clientId))]
    if (ids.length !== 1) return null
    clientIds.add(ids[0]!)
    clientName = matches[0]?.clientName.trim() || clientName
  }
  if (!sawMba || clientIds.size !== 1) return null
  return { clientId: [...clientIds][0]!, clientName }
}

/**
 * Contacts already filtered to FY26 AR invoices. A contact is linked when a
 * stored row matches its id or any invoice contact name. Suggestions are not saved.
 */
export function assembleUnlinkedContacts(input: {
  invoices: UnlinkedInvoiceInput[]
  orphanInvoiceCount: number
  links: ContactLinkRow[]
  clients: ClientRow[]
  aliases: AliasRow[]
  mbaHints: MbaClientHint[]
}): UnlinkedContactsPayload {
  const groups = new Map<string, UnlinkedInvoiceInput[]>()
  let orphanInvoiceCount = input.orphanInvoiceCount
  for (const invoice of input.invoices) {
    const id = invoice.xeroContactId.trim()
    if (!id) {
      orphanInvoiceCount += 1
      continue
    }
    const list = groups.get(id) ?? []
    list.push(invoice)
    groups.set(id, list)
  }

  const contacts: UnlinkedContact[] = []
  let linked = 0
  let hiddenInvoiceCount = orphanInvoiceCount

  for (const [xeroContactId, rows] of groups) {
    const names = rows.map((row) => row.contactName)
    const stored =
      contactHasStoredLink(names[0] ?? "", xeroContactId, input.links) ||
      names.some((name) => contactHasStoredLink(name, "", input.links))
    if (stored) {
      linked += 1
      continue
    }

    hiddenInvoiceCount += rows.length
    const contactName = latestName(rows)
    const named = suggestClientWithoutStoredLink(contactName, input.clients, input.aliases)
    const mba = named
      ? null
      : suggestMbaClient(
          rows.map((row) => row.mbaNumber ?? ""),
          input.mbaHints,
        )
    const suggestion: UnlinkedSuggestion | null = named
      ? named
      : mba
        ? { clientId: mba.clientId, clientName: mba.clientName || contactName, via: "mba" }
        : null

    let totalCents = 0
    let amountDueCents = 0
    let latestIssueDate = ""
    for (const row of rows) {
      totalCents += dollarsToCents(row.totalDollars)
      amountDueCents += dollarsToCents(row.amountDueDollars)
      if (row.issueDate > latestIssueDate) latestIssueDate = row.issueDate
    }

    contacts.push({
      xeroContactId,
      contactName,
      invoiceCount: rows.length,
      totalCents,
      amountDueCents,
      latestIssueDate,
      suggestion,
    })
  }

  contacts.sort(
    (a, b) =>
      b.amountDueCents - a.amountDueCents ||
      a.contactName.localeCompare(b.contactName) ||
      a.xeroContactId.localeCompare(b.xeroContactId),
  )

  return {
    contacts,
    coverage: {
      linked,
      total: groups.size,
      hiddenInvoiceCount,
    },
  }
}

function ymd(value: unknown): string {
  const text = String(value ?? "").slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : ""
}

export async function findClientForContactLink(clientId: number): Promise<boolean> {
  const db = getDb()
  const rows = rowsOf<{ id: number }>(
    await db.execute(sql`SELECT id FROM clients WHERE id = ${clientId} LIMIT 1`),
  )
  return rows.length > 0
}

export async function loadUnlinkedXeroContacts(): Promise<UnlinkedContactsPayload> {
  const db = getDb()
  const [invoiceRows, orphanRows, clientRows, aliasRows, masterRows, links] = await Promise.all([
    rowsOf<{
      xero_contact_id: string | null
      contact_name: string | null
      total: string | number | null
      amount_due: string | number | null
      issue_date: string | null
      mba_number: string | null
    }>(
      await db.execute(sql`
        SELECT
          i.xero_contact_id,
          c.name AS contact_name,
          i.total,
          i.amount_due,
          i.issue_date::text AS issue_date,
          i.mba_number
        FROM xero_ar_invoices i
        LEFT JOIN xero_contacts c ON c.xero_contact_id = i.xero_contact_id
        WHERE i.issue_date >= ${FY26_AR_START}
          AND NULLIF(btrim(COALESCE(i.xero_contact_id, '')), '') IS NOT NULL
      `),
    ),
    rowsOf<{ n: number }>(
      await db.execute(sql`
        SELECT count(*)::int AS n
        FROM xero_ar_invoices
        WHERE issue_date >= ${FY26_AR_START}
          AND NULLIF(btrim(COALESCE(xero_contact_id, '')), '') IS NULL
      `),
    ),
    rowsOf<{ id: number; mp_client_name: string | null }>(
      await db.execute(sql`SELECT id, mp_client_name FROM clients`),
    ),
    rowsOf<{ contact_key: string; client_id: number }>(
      await db.execute(sql`SELECT contact_key, client_id FROM xero_client_aliases`),
    ),
    rowsOf<{
      mba_number: string | null
      client_id: number | null
      mp_client_name: string | null
      mbaidentifier: string | null
    }>(
      await db.execute(sql`
        SELECT
          m.mba_number,
          m.client_id,
          c.mp_client_name,
          c.mbaidentifier
        FROM media_plan_masters m
        INNER JOIN clients c ON c.id = m.client_id
        WHERE NULLIF(btrim(COALESCE(m.mba_number, '')), '') IS NOT NULL
      `),
    ),
    loadContactLinks(),
  ])

  return assembleUnlinkedContacts({
    orphanInvoiceCount: Number(orphanRows[0]?.n ?? 0) || 0,
    links,
    clients: clientRows.map((row) => ({
      id: Number(row.id),
      mp_client_name: row.mp_client_name,
    })),
    aliases: aliasRows.map((row) => ({
      contact_key: row.contact_key,
      client_id: Number(row.client_id),
    })),
    mbaHints: masterRows.flatMap((row) => {
      const mbaNumber = String(row.mba_number ?? "").trim()
      const clientId = Number(row.client_id)
      if (!mbaNumber || !Number.isInteger(clientId) || clientId <= 0) return []
      return [
        {
          mbaNumber,
          clientId,
          clientName: row.mp_client_name?.trim() || "",
          mbaIdentifier: row.mbaidentifier,
        },
      ]
    }),
    invoices: invoiceRows.map((row) => ({
      xeroContactId: String(row.xero_contact_id ?? ""),
      contactName: String(row.contact_name ?? ""),
      totalDollars: coerceDollars(row.total),
      amountDueDollars: coerceDollars(row.amount_due),
      issueDate: ymd(row.issue_date),
      mbaNumber: row.mba_number,
    })),
  })
}
