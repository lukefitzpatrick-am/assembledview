/**
 * Stage d: contacts_refresh — page GET /Contacts with own watermark keys in notes.
 */

import { sql } from "drizzle-orm"

import { db } from "@/db"

import { getXeroAccessToken, xeroApiRequest } from "../client"
import { rowsOf } from "../dbRows"
import { resumeContactsWatermark } from "../watermark"

export const CONTACTS_PAGES_CAP = 20

export type ContactsRefreshResult = {
  stage: "contacts_refresh"
  ok: boolean
  error?: string
  pages_fetched: number
  contacts_upserted: number
  watermark_used: string
  new_watermark: string
  incomplete: boolean
  next_page?: number
  errors: string[]
}

type XeroContact = {
  ContactID: string
  Name?: string
  EmailAddress?: string
  IsSupplier?: boolean
  IsCustomer?: boolean
}

function contactRole(c: XeroContact): string | null {
  if (c.IsCustomer && c.IsSupplier) return "both"
  if (c.IsCustomer) return "customer"
  if (c.IsSupplier) return "supplier"
  return null
}

export async function stageContactsRefresh(opts?: {
  fetchImpl?: typeof fetch
  pagesCap?: number
  runStartedAt?: Date
}): Promise<ContactsRefreshResult> {
  const pagesCap = opts?.pagesCap ?? CONTACTS_PAGES_CAP
  const runStartedAt = opts?.runStartedAt ?? new Date()
  const fetchImpl = opts?.fetchImpl ?? fetch
  const errors: string[] = []

  try {
    const accessToken = await getXeroAccessToken(fetchImpl)

    const lastLogRow =
      rowsOf<{
        notes: string | null
        watermark_used: string | null
        new_watermark: string | null
      }>(
        await db.execute(sql`
          SELECT notes, watermark_used, new_watermark
          FROM xero_sync_log
          ORDER BY id DESC
          LIMIT 1
        `),
      )[0] ?? null

    const { watermarkStr, nextPage } = resumeContactsWatermark(
      lastLogRow
        ? {
            notes: lastLogRow.notes,
            watermarkUsed: lastLogRow.watermark_used,
            newWatermark: lastLogRow.new_watermark,
          }
        : null,
    )

    let currentPage = nextPage
    let pagesFetched = 0
    let contactsUpserted = 0
    let stopLoop = false

    while (!stopLoop && pagesFetched < pagesCap) {
      try {
        const api = await xeroApiRequest({
          accessToken,
          path: `/Contacts?page=${currentPage}`,
          ifModifiedSince: watermarkStr,
          fetchImpl,
        })
        if (api.status >= 400) {
          errors.push(`Contacts page ${currentPage}: HTTP ${api.status}`)
          stopLoop = true
          break
        }
        const body = api.body as { Contacts?: XeroContact[] }
        const contacts = body.Contacts ?? []
        if (contacts.length === 0) {
          stopLoop = true
          break
        }

        for (const c of contacts) {
          await db.execute(sql`
            INSERT INTO xero_contacts (
              xero_contact_id, name, role, email, raw_json, synced_at
            ) VALUES (
              ${c.ContactID},
              ${c.Name ?? null},
              ${contactRole(c)},
              ${c.EmailAddress ?? null},
              ${JSON.stringify(c)}::jsonb,
              now()
            )
            ON CONFLICT (xero_contact_id) DO UPDATE SET
              name = EXCLUDED.name,
              role = EXCLUDED.role,
              email = EXCLUDED.email,
              raw_json = EXCLUDED.raw_json,
              synced_at = EXCLUDED.synced_at
          `)
          contactsUpserted++
        }

        currentPage++
        pagesFetched++
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err))
        stopLoop = true
      }
    }

    const incomplete = !stopLoop && pagesFetched >= pagesCap
    return {
      stage: "contacts_refresh",
      ok: errors.length === 0,
      pages_fetched: pagesFetched,
      contacts_upserted: contactsUpserted,
      watermark_used: watermarkStr,
      new_watermark: runStartedAt.toISOString(),
      incomplete,
      next_page: incomplete ? currentPage : undefined,
      errors,
      error: errors[0],
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      stage: "contacts_refresh",
      ok: false,
      error: msg,
      pages_fetched: 0,
      contacts_upserted: 0,
      watermark_used: "2024-07-01T00:00:00",
      new_watermark: runStartedAt.toISOString(),
      incomplete: false,
      errors: [msg],
    }
  }
}
