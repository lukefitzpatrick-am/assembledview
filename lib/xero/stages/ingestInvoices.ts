/**
 * Stage a: ingest_invoices — page Xero Invoices with If-Modified-Since watermark.
 */

import { sql } from "drizzle-orm"

import { db } from "@/db"

import {
  applyMatchMba,
  loadMbaMasters,
  loadScopeOfWorkRefs,
} from "../applyMatchMba"
import { getXeroAccessToken, xeroApiRequest } from "../client"
import { rowsOf } from "../dbRows"
import { coerceDollars } from "../money"
import { parseXeroDateString, parseXeroDotNetDate } from "../parseXeroDate"
import { invoiceIngestWindow } from "../watermark"

export const INVOICE_PAGES_CAP = 20

export type IngestInvoicesResult = {
  stage: "ingest_invoices"
  ok: boolean
  error?: string
  pages_fetched: number
  ar_upserted: number
  ap_upserted: number
  matched: number
  unmatched: number
  watermark_used: string
  new_watermark: string
  /** When true, notes should carry next_page for resume. */
  incomplete: boolean
  next_page?: number
  errors: string[]
}

type XeroInvoice = {
  InvoiceID: string
  InvoiceNumber?: string
  Type?: string
  Status?: string
  SubTotal?: number
  TotalTax?: number
  Total?: number
  AmountPaid?: number
  AmountDue?: number
  CurrencyCode?: string
  DateString?: string
  DueDateString?: string
  Reference?: string
  LineItems?: unknown
  UpdatedDateUTC?: string
  Contact?: { ContactID?: string }
}

function moneyStr(n: number): string {
  return n.toFixed(2)
}

export async function stageIngestInvoices(opts?: {
  fetchImpl?: typeof fetch
  pagesCap?: number
  runStartedAt?: Date
  /** Narrow If-Modified-Since (finance pull). Cron omits this and uses the watermark. */
  ifModifiedSince?: string
}): Promise<IngestInvoicesResult> {
  const pagesCap = opts?.pagesCap ?? INVOICE_PAGES_CAP
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
          WHERE COALESCE(notes::jsonb->>'source', '') IS DISTINCT FROM 'pull-xero'
          ORDER BY id DESC
          LIMIT 1
        `),
      )[0] ?? null

    const { watermarkStr, nextPage } = invoiceIngestWindow(
      lastLogRow
        ? {
            notes: lastLogRow.notes,
            watermarkUsed: lastLogRow.watermark_used,
            newWatermark: lastLogRow.new_watermark,
          }
        : null,
      opts?.ifModifiedSince,
    )

    const [masters, scopes] = await Promise.all([
      loadMbaMasters(),
      loadScopeOfWorkRefs(),
    ])

    let currentPage = nextPage
    let pagesFetched = 0
    let arUpserted = 0
    let apUpserted = 0
    let matched = 0
    let unmatched = 0
    let stopLoop = false
    let sawNegativeAr = false

    while (!stopLoop && pagesFetched < pagesCap) {
      try {
        const api = await xeroApiRequest({
          accessToken,
          path: `/Invoices?page=${currentPage}`,
          ifModifiedSince: watermarkStr,
          fetchImpl,
        })
        if (api.status >= 400) {
          errors.push(`Invoices page ${currentPage}: HTTP ${api.status}`)
          stopLoop = true
          break
        }
        const body = api.body as { Invoices?: XeroInvoice[] }
        const invoices = body.Invoices ?? []
        if (invoices.length === 0) {
          stopLoop = true
          break
        }

        for (const inv of invoices) {
          const updated = parseXeroDotNetDate(inv.UpdatedDateUTC)
          const xeroUpdatedUtc = updated
            ? updated.toISOString()
            : runStartedAt.toISOString()
          const issueDate = parseXeroDateString(inv.DateString)
          const dueDate = parseXeroDateString(inv.DueDateString)
          const referenceRaw = inv.Reference ?? ""
          const contactId = inv.Contact?.ContactID ?? null

          if (inv.Type === "ACCREC" || inv.Type === "ACCRECCREDIT") {
            const totalDollars = coerceDollars(inv.Total)
            // Credit notes: store signed total (negative) so O7 dispute reconcile can match.
            const signedTotal =
              inv.Type === "ACCRECCREDIT" && totalDollars > 0
                ? -totalDollars
                : totalDollars
            const row = rowsOf<{
              id: number
              mba_match_id: number | null
            }>(
              await db.execute(sql`
              INSERT INTO xero_ar_invoices (
                xero_invoice_id, invoice_number, xero_contact_id, status,
                sub_total, total_tax, total, amount_paid, amount_due, currency,
                issue_date, due_date, line_items_json, xero_updated_utc,
                last_synced_at, raw_json, reference_raw
              ) VALUES (
                ${inv.InvoiceID},
                ${inv.InvoiceNumber ?? null},
                ${contactId},
                ${inv.Status ?? null},
                ${moneyStr(coerceDollars(inv.SubTotal))},
                ${moneyStr(coerceDollars(inv.TotalTax))},
                ${moneyStr(signedTotal)},
                ${moneyStr(coerceDollars(inv.AmountPaid))},
                ${moneyStr(coerceDollars(inv.AmountDue))},
                ${inv.CurrencyCode ?? null},
                ${issueDate},
                ${dueDate},
                ${JSON.stringify(inv.LineItems ?? [])}::jsonb,
                ${xeroUpdatedUtc}::timestamptz,
                now(),
                ${JSON.stringify(inv)}::jsonb,
                ${referenceRaw}
              )
              ON CONFLICT (xero_invoice_id) DO UPDATE SET
                invoice_number = EXCLUDED.invoice_number,
                xero_contact_id = EXCLUDED.xero_contact_id,
                status = EXCLUDED.status,
                sub_total = EXCLUDED.sub_total,
                total_tax = EXCLUDED.total_tax,
                total = EXCLUDED.total,
                amount_paid = EXCLUDED.amount_paid,
                amount_due = EXCLUDED.amount_due,
                currency = EXCLUDED.currency,
                issue_date = EXCLUDED.issue_date,
                due_date = EXCLUDED.due_date,
                line_items_json = EXCLUDED.line_items_json,
                xero_updated_utc = EXCLUDED.xero_updated_utc,
                last_synced_at = EXCLUDED.last_synced_at,
                raw_json = EXCLUDED.raw_json,
                reference_raw = EXCLUDED.reference_raw
              RETURNING id, mba_match_id
            `),
            )[0]
            arUpserted++
            if (signedTotal < 0) {
              sawNegativeAr = true
            }
            if (row && row.mba_match_id == null && signedTotal >= 0) {
              const result = await applyMatchMba(
                {
                  arInvoiceId: Number(row.id),
                  referenceRaw,
                  xeroInvoiceId: inv.InvoiceID,
                  invoiceNumber: inv.InvoiceNumber ?? null,
                  issueDate,
                },
                masters,
                scopes,
              )
              if (result.matched) matched++
              else unmatched++
            } else if (signedTotal >= 0) {
              matched++
            }
          } else if (inv.Type === "ACCPAY") {
            await db.execute(sql`
              INSERT INTO xero_ap_bills (
                xero_invoice_id, invoice_number, xero_contact_id, status,
                sub_total, total_tax, total, amount_paid, amount_due, currency,
                issue_date, due_date, line_items_json, xero_updated_utc,
                last_synced_at, raw_json, reference_raw
              ) VALUES (
                ${inv.InvoiceID},
                ${inv.InvoiceNumber ?? null},
                ${contactId},
                ${inv.Status ?? null},
                ${moneyStr(coerceDollars(inv.SubTotal))},
                ${moneyStr(coerceDollars(inv.TotalTax))},
                ${moneyStr(coerceDollars(inv.Total))},
                ${moneyStr(coerceDollars(inv.AmountPaid))},
                ${moneyStr(coerceDollars(inv.AmountDue))},
                ${inv.CurrencyCode ?? null},
                ${issueDate},
                ${dueDate},
                ${JSON.stringify(inv.LineItems ?? [])}::jsonb,
                ${xeroUpdatedUtc}::timestamptz,
                now(),
                ${JSON.stringify(inv)}::jsonb,
                ${referenceRaw}
              )
              ON CONFLICT (xero_invoice_id) DO UPDATE SET
                invoice_number = EXCLUDED.invoice_number,
                xero_contact_id = EXCLUDED.xero_contact_id,
                status = EXCLUDED.status,
                sub_total = EXCLUDED.sub_total,
                total_tax = EXCLUDED.total_tax,
                total = EXCLUDED.total,
                amount_paid = EXCLUDED.amount_paid,
                amount_due = EXCLUDED.amount_due,
                currency = EXCLUDED.currency,
                issue_date = EXCLUDED.issue_date,
                due_date = EXCLUDED.due_date,
                line_items_json = EXCLUDED.line_items_json,
                xero_updated_utc = EXCLUDED.xero_updated_utc,
                last_synced_at = EXCLUDED.last_synced_at,
                raw_json = EXCLUDED.raw_json,
                reference_raw = EXCLUDED.reference_raw
            `)
            apUpserted++
          }
        }

        currentPage++
        pagesFetched++
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err))
        stopLoop = true
      }
    }

    const incomplete = !stopLoop && pagesFetched >= pagesCap

    // O7: credit-note-shaped AR (negative total / ACCRECCREDIT) closes disputed matches.
    if (sawNegativeAr) {
      try {
        const { reconcileDisputedWithArrivedCreditNotes } = await import(
          "@/lib/xero/stages/matchRunItems"
        )
        await reconcileDisputedWithArrivedCreditNotes()
      } catch (err) {
        console.warn("[xero-sync] dispute credit-note reconcile after ingest skipped", err)
      }
    }

    return {
      stage: "ingest_invoices",
      ok: errors.length === 0,
      pages_fetched: pagesFetched,
      ar_upserted: arUpserted,
      ap_upserted: apUpserted,
      matched,
      unmatched,
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
      stage: "ingest_invoices",
      ok: false,
      error: msg,
      pages_fetched: 0,
      ar_upserted: 0,
      ap_upserted: 0,
      matched: 0,
      unmatched: 0,
      watermark_used: DEFAULT_FALLBACK,
      new_watermark: runStartedAt.toISOString(),
      incomplete: false,
      errors: [msg],
    }
  }
}

const DEFAULT_FALLBACK = "2024-07-01T00:00:00"
