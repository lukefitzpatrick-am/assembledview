/**
 * Stage b: import_billing_records — FY26+ AR → finance_billing_records (xero: keys only).
 */

import { sql } from "drizzle-orm"

import { db } from "@/db"

import {
  inferBillingType,
  mapXeroStatusToBillingStatus,
  parsePoNumber,
  xeroInvoiceKey,
} from "../billingStatus"
import { rowsOf } from "../dbRows"
import { coerceDollars, dollarsToCents } from "../money"
import {
  resolveClientFromContact,
  type AliasRow,
  type ClientRow,
} from "../normalizeContact"

export type ImportBillingResult = {
  stage: "import_billing_records"
  ok: boolean
  error?: string
  imported: number
  pending_edits: number
  by_type: { media: number; retainer: number; sow: number }
  skipped_app_keys: number
}

type ArRow = {
  xero_invoice_id: string
  xero_contact_id: string | null
  reference_raw: string | null
  mba_number: string | null
  mba_match_id: number | null
  issue_date: string | null
  status: string | null
  total: string | number | null
  line_items_json: unknown
  invoice_number: string | null
}

export async function stageImportBillingRecords(): Promise<ImportBillingResult> {
  try {
    const clients: ClientRow[] = rowsOf<{
      id: number
      mp_client_name: string | null
      payment_days: number | null
      payment_terms: string | null
    }>(
      await db.execute(sql`
        SELECT id, mp_client_name, payment_days, payment_terms FROM clients
      `),
    ).map((c) => ({
      id: Number(c.id),
      mp_client_name: c.mp_client_name,
      payment_days: c.payment_days != null ? Number(c.payment_days) : null,
      payment_terms: c.payment_terms,
    }))

    let aliases: AliasRow[] = []
    try {
      aliases = rowsOf<{
        contact_key: string
        client_id: number
      }>(
        await db.execute(sql`SELECT contact_key, client_id FROM xero_client_aliases`),
      ).map((a) => ({
        contact_key: a.contact_key,
        client_id: Number(a.client_id),
      }))
    } catch {
      aliases = []
    }

    const contactById = new Map<string, string>()
    for (const c of rowsOf<{
      xero_contact_id: string
      name: string | null
    }>(await db.execute(sql`SELECT xero_contact_id, name FROM xero_contacts`))) {
      contactById.set(c.xero_contact_id, c.name ?? "")
    }

    const campaignById = new Map<number, string>()
    for (const m of rowsOf<{
      id: number
      campaign_name: string | null
    }>(
      await db.execute(sql`SELECT id, campaign_name FROM media_plan_masters`),
    )) {
      campaignById.set(Number(m.id), m.campaign_name ?? "")
    }

    const arRows = rowsOf<ArRow>(
      await db.execute(sql`
      SELECT
        xero_invoice_id, xero_contact_id, reference_raw, mba_number, mba_match_id,
        issue_date::text AS issue_date, status, total, line_items_json, invoice_number
      FROM xero_ar_invoices
      WHERE issue_date >= '2025-07-01'
    `),
    )

    let imported = 0
    let pendingEdits = 0
    let countMedia = 0
    let countRetainer = 0
    let countSow = 0
    const skippedAppKeys = 0

    for (const row of arRows) {
      const invoiceKey = xeroInvoiceKey(row.xero_invoice_id)

      const contactName =
        (row.xero_contact_id && contactById.get(row.xero_contact_id)) || ""
      const resolved = resolveClientFromContact(contactName, clients, aliases)

      const ref = row.reference_raw ?? ""
      let firstDesc = ""
      const lines = row.line_items_json
      if (Array.isArray(lines) && lines.length > 0) {
        const first = lines[0] as { Description?: string }
        firstDesc = first?.Description ?? ""
      }

      const billingType = inferBillingType(ref, firstDesc)
      const mbaNumber = row.mba_number ?? ""
      let campaignName = ""
      if (row.mba_match_id != null) {
        campaignName = campaignById.get(Number(row.mba_match_id)) ?? ""
      }
      const poNumber = parsePoNumber(ref)
      const issueDate = row.issue_date ? String(row.issue_date).slice(0, 10) : null
      const billingMonth = issueDate ? issueDate.slice(0, 7) : null
      const status = mapXeroStatusToBillingStatus(row.status)
      const totalDollars = coerceDollars(row.total)
      const billedAmountCents = dollarsToCents(totalDollars)
      const hasPendingEdits =
        !resolved.resolved || (billingType === "media" && mbaNumber === "")

      await db.execute(sql`
        INSERT INTO finance_billing_records (
          invoice_key, clients_id, client_name, billing_type, mba_number,
          campaign_name, po_number, billing_month, invoice_date, payment_days,
          payment_terms, status, total, billed, billed_at, billed_by,
          has_pending_edits, source_billing_schedule_id, notes, updated_at,
          billed_amount_cents
        ) VALUES (
          ${invoiceKey},
          ${resolved.clientsId},
          ${resolved.clientName || contactName},
          ${billingType},
          ${mbaNumber},
          ${campaignName},
          ${poNumber},
          ${billingMonth},
          ${issueDate},
          ${resolved.paymentDays},
          ${resolved.paymentTerms},
          ${status},
          ${totalDollars.toFixed(2)},
          true,
          ${issueDate ? `${issueDate}T00:00:00+00:00` : null}::timestamptz,
          0,
          ${hasPendingEdits},
          0,
          '',
          now(),
          ${billedAmountCents}
        )
        ON CONFLICT (invoice_key) DO UPDATE SET
          clients_id = EXCLUDED.clients_id,
          client_name = EXCLUDED.client_name,
          billing_type = EXCLUDED.billing_type,
          mba_number = EXCLUDED.mba_number,
          campaign_name = EXCLUDED.campaign_name,
          po_number = EXCLUDED.po_number,
          billing_month = EXCLUDED.billing_month,
          invoice_date = EXCLUDED.invoice_date,
          payment_days = EXCLUDED.payment_days,
          payment_terms = EXCLUDED.payment_terms,
          status = EXCLUDED.status,
          total = EXCLUDED.total,
          billed = EXCLUDED.billed,
          billed_at = EXCLUDED.billed_at,
          has_pending_edits = EXCLUDED.has_pending_edits,
          billed_amount_cents = EXCLUDED.billed_amount_cents,
          updated_at = EXCLUDED.updated_at
        WHERE finance_billing_records.invoice_key LIKE 'xero:%'
      `)

      imported++
      if (hasPendingEdits) pendingEdits++
      if (billingType === "retainer") countRetainer++
      else if (billingType === "sow") countSow++
      else countMedia++
    }

    return {
      stage: "import_billing_records",
      ok: true,
      imported,
      pending_edits: pendingEdits,
      by_type: {
        media: countMedia,
        retainer: countRetainer,
        sow: countSow,
      },
      skipped_app_keys: skippedAppKeys,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      stage: "import_billing_records",
      ok: false,
      error: msg,
      imported: 0,
      pending_edits: 0,
      by_type: { media: 0, retainer: 0, sow: 0 },
      skipped_app_keys: 0,
    }
  }
}
