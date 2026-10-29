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
import {
  CREDIT_NOTE_PAGES_CAP,
  creditNoteToXeroInvoice,
  type XeroCreditNote,
} from "../creditNotes"
import { isFeatureOn } from "@/lib/features/server"

import { rowsOf } from "../dbRows"
import { coerceDollars } from "../money"
import { parseXeroDateString, parseXeroDotNetDate } from "../parseXeroDate"
import { fetchCronWatermarkRow } from "../runLoggedStage"
import { tickStageBudget, type StageBudget } from "../stageBudget"
import { invoiceIngestWindow } from "../watermark"

export const INVOICE_PAGES_CAP = 20

export type IngestInvoicesResult = {
  stage: "ingest_invoices"
  ok: boolean
  error?: string
  pages_fetched: number
  ar_upserted: number
  ap_upserted: number
  /** Sales credit notes from /CreditNotes (XERO_SYNC_CREDIT_NOTES). Counted in ar_upserted too. */
  credit_notes_upserted?: number
  matched: number
  unmatched: number
  watermark_used: string
  new_watermark: string
  /** When true, notes should carry next_page for resume. */
  incomplete: boolean
  next_page?: number
  errors: string[]
}

export type XeroInvoice = {
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

export type UpsertPagedInvoiceResult =
  | {
      kind: "ar"
      /** Null when RETURNING produced no row. */
      id: number | null
      mbaMatchId: number | null
      signedTotal: number
      referenceRaw: string
      issueDate: string | null
      invoiceNumber: string | null
    }
  | { kind: "ap" }
  | { kind: "skip" }

/**
 * Same INSERT … ON CONFLICT the nightly ingest uses for one paged invoice.
 * Does not match MBA references — the cron calls applyMatchMba after AR rows.
 */
export async function upsertPagedXeroInvoice(
  inv: XeroInvoice,
  runStartedAt: Date,
): Promise<UpsertPagedInvoiceResult> {
  const updated = parseXeroDotNetDate(inv.UpdatedDateUTC)
  const xeroUpdatedUtc = updated
    ? updated.toISOString()
    : runStartedAt.toISOString()
  const issueDate = parseXeroDateString(inv.DateString)
  const dueDate = parseXeroDateString(inv.DueDateString)
  const referenceRaw = inv.Reference ?? ""
  const contactId = inv.Contact?.ContactID ?? null

  if (inv.Type === "ACCREC" || inv.Type === "ACCRECCREDIT") {
    // Credit notes are stored negative: total, sub_total and tax. The O7
    // dispute reconcile reads sub_total < 0; the true-up reads the Type.
    const credit = inv.Type === "ACCRECCREDIT"
    const signed = (n: number) => (credit && n > 0 ? -n : n)
    const totalDollars = coerceDollars(inv.Total)
    const signedTotal = signed(totalDollars)
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
                ${moneyStr(signed(coerceDollars(inv.SubTotal)))},
                ${moneyStr(signed(coerceDollars(inv.TotalTax)))},
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
    return {
      kind: "ar",
      id: row ? Number(row.id) : null,
      mbaMatchId:
        row && row.mba_match_id != null ? Number(row.mba_match_id) : null,
      signedTotal,
      referenceRaw,
      issueDate,
      invoiceNumber: inv.InvoiceNumber ?? null,
    }
  }

  if (inv.Type === "ACCPAY") {
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
    return { kind: "ap" }
  }

  return { kind: "skip" }
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
  /** Cron passes this so a long page walk returns incomplete instead of being killed. */
  budget?: StageBudget
}): Promise<IngestInvoicesResult> {
  const pagesCap = opts?.pagesCap ?? INVOICE_PAGES_CAP
  const runStartedAt = opts?.runStartedAt ?? new Date()
  const fetchImpl = opts?.fetchImpl ?? fetch
  const errors: string[] = []

  try {
    const accessToken = await getXeroAccessToken(fetchImpl)

    const lastLogRow = await fetchCronWatermarkRow("invoices")

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
    let budgetHit = false
    let sawNegativeAr = false

    while (!stopLoop && pagesFetched < pagesCap) {
      if (opts?.budget && tickStageBudget(opts.budget).status === "incomplete") {
        budgetHit = true
        break
      }
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
          const persisted = await upsertPagedXeroInvoice(inv, runStartedAt)
          if (persisted.kind === "ar") {
            arUpserted++
            // Credit notes: signed total is negative so O7 dispute reconcile can match.
            if (persisted.signedTotal < 0) {
              sawNegativeAr = true
            }
            if (
              persisted.id != null &&
              persisted.mbaMatchId == null &&
              persisted.signedTotal >= 0
            ) {
              const result = await applyMatchMba(
                {
                  arInvoiceId: persisted.id,
                  referenceRaw: persisted.referenceRaw,
                  xeroInvoiceId: inv.InvoiceID,
                  invoiceNumber: persisted.invoiceNumber,
                  issueDate: persisted.issueDate,
                },
                masters,
                scopes,
              )
              if (result.matched) matched++
              else unmatched++
            } else if (persisted.signedTotal >= 0) {
              matched++
            }
          } else if (persisted.kind === "ap") {
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

    let incomplete = budgetHit || (!stopLoop && pagesFetched >= pagesCap)

    // T9: sales credit notes, same watermark. Only after the invoice pages
    // finished cleanly; an unfinished credit-note walk marks the run
    // incomplete so the next run keeps this watermark (the upsert is idempotent).
    let creditNotesUpserted: number | undefined
    if (!incomplete && errors.length === 0 && (await isFeatureOn("xero_credit_notes"))) {
      const cn = await ingestCreditNotePages({
        accessToken,
        watermarkStr,
        fetchImpl,
        runStartedAt,
        budget: opts?.budget,
      })
      creditNotesUpserted = cn.upserted
      arUpserted += cn.upserted
      if (cn.upserted > 0) sawNegativeAr = true
      errors.push(...cn.errors)
      if (cn.incomplete) incomplete = true
    }

    // O7: credit-note-shaped AR (negative total / ACCRECCREDIT) closes disputed matches.
    // Skip when the time budget is already spent so the log row can be updated.
    if (sawNegativeAr && !budgetHit) {
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
      ...(creditNotesUpserted === undefined ? {} : { credit_notes_upserted: creditNotesUpserted }),
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

export type CreditNotePagesResult = {
  pages: number
  upserted: number
  incomplete: boolean
  errors: string[]
}

/**
 * Page /CreditNotes from the invoice watermark and upsert the sales credit
 * notes (ACCRECCREDIT) into xero_ar_invoices. No MBA match: the ingest only
 * matches non-negative AR, so a credit note is placed by a hand link on the
 * true-up page or its line descriptions.
 */
export async function ingestCreditNotePages(args: {
  accessToken: string
  watermarkStr: string
  fetchImpl: typeof fetch
  runStartedAt: Date
  budget?: StageBudget
  pagesCap?: number
  upsert?: typeof upsertPagedXeroInvoice
}): Promise<CreditNotePagesResult> {
  const upsert = args.upsert ?? upsertPagedXeroInvoice
  const cap = args.pagesCap ?? CREDIT_NOTE_PAGES_CAP
  const errors: string[] = []
  let page = 1
  let pages = 0
  let upserted = 0
  let done = false
  while (!done && pages < cap) {
    if (args.budget && tickStageBudget(args.budget).status === "incomplete") {
      return { pages, upserted, incomplete: true, errors }
    }
    try {
      const api = await xeroApiRequest({
        accessToken: args.accessToken,
        path: `/CreditNotes?page=${page}`,
        ifModifiedSince: args.watermarkStr,
        fetchImpl: args.fetchImpl,
      })
      if (api.status >= 400) {
        errors.push(`CreditNotes page ${page}: HTTP ${api.status}`)
        return { pages, upserted, incomplete: false, errors }
      }
      const notes = (api.body as { CreditNotes?: XeroCreditNote[] }).CreditNotes ?? []
      if (notes.length === 0) {
        done = true
        break
      }
      for (const cn of notes) {
        if (cn.Type !== "ACCRECCREDIT" || !cn.CreditNoteID) continue
        const persisted = await upsert(creditNoteToXeroInvoice(cn), args.runStartedAt)
        if (persisted.kind === "ar") upserted++
      }
      page++
      pages++
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err))
      return { pages, upserted, incomplete: false, errors }
    }
  }
  return { pages, upserted, incomplete: !done, errors }
}
