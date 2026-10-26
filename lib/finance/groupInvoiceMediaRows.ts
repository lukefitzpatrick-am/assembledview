/**
 * FB-2 grouping of media lines inside one invoice block (client, MBA, month,
 * billing type) for every finance download (review Excel and CSV, Send to
 * accounts workbook, client hub export A).
 *
 * - Lines with the same item code (G./D.), media type and descriptor label
 *   become one row. Amounts sum in integer cents.
 * - Rows are ordered by supplier (publisher), then detail.
 * - A supplier with more than one row gets a subtotal row after its rows.
 *   Subtotal rows are display only: never add them into a total or import.
 *
 * Service rows (fee, ad serving, production) are not media lines and are not
 * passed here. The block total is unchanged: `sumInvoiceLineRowsCents` of the
 * grouped `line` rows equals the cents sum of the input lines.
 */

import type { FinanceLineItem } from "@/lib/finance/utils"

export type InvoiceMediaRowType = "line" | "subtotal"

export type InvoiceMediaRow = {
  rowType: InvoiceMediaRowType
  /** Blank on subtotal rows. */
  itemCode: string
  /** Blank on subtotal rows. */
  mediaType: string
  supplier: string
  detail: string
  /** Line: the descriptor label. Subtotal: "<supplier> subtotal". */
  description: string
  amountCents: number
  /** Dollars, 2dp, from `amountCents`. */
  amount: number
  /** Source lines summed into this row. */
  lineCount: number
  /** Plan line ids summed into this row (line rows only), for consumers that need one id per line. */
  planLineItemIds: string[]
}

function norm(value: string | null | undefined): string {
  return String(value ?? "").trim().replace(/\s+/g, " ")
}

function key(value: string): string {
  return value.toLowerCase()
}

function toCents(amount: number): number {
  return Math.round(Number(amount || 0) * 100)
}

function compareText(a: string, b: string): number {
  return a.localeCompare(b, "en-AU", { sensitivity: "base" })
}

function supplierOf(li: FinanceLineItem): string {
  return norm(li.supplier ?? li.publisherName ?? "")
}

/** Group, order and subtotal the media lines of one invoice block. */
export function groupInvoiceMediaRows(lines: readonly FinanceLineItem[]): InvoiceMediaRow[] {
  const groups = new Map<string, InvoiceMediaRow>()
  for (const li of lines) {
    const itemCode = norm(li.itemCode)
    const mediaType = norm(li.mediaType)
    const description = norm(li.description)
    const supplier = supplierOf(li)
    const detail = norm(li.detail ?? "")
    const k = [itemCode, mediaType, description].map(key).join("\u001f")
    let row = groups.get(k)
    if (!row) {
      row = {
        rowType: "line",
        itemCode,
        mediaType,
        supplier,
        detail,
        description,
        amountCents: 0,
        amount: 0,
        lineCount: 0,
        planLineItemIds: [],
      }
      groups.set(k, row)
    }
    row.amountCents += toCents(li.amount)
    row.lineCount += 1
    const id = norm(li.planLineItemId ?? "")
    if (id && !row.planLineItemIds.includes(id)) row.planLineItemIds.push(id)
  }

  const rows = [...groups.values()]
  for (const r of rows) r.amount = r.amountCents / 100
  rows.sort(
    (a, b) =>
      compareText(a.supplier, b.supplier) ||
      compareText(a.detail, b.detail) ||
      compareText(a.description, b.description) ||
      compareText(a.mediaType, b.mediaType) ||
      compareText(a.itemCode, b.itemCode)
  )

  const out: InvoiceMediaRow[] = []
  let i = 0
  while (i < rows.length) {
    const supplierKey = key(rows[i]!.supplier)
    let j = i
    while (j < rows.length && key(rows[j]!.supplier) === supplierKey) j++
    const run = rows.slice(i, j)
    out.push(...run)
    if (run.length > 1) {
      const cents = run.reduce((s, r) => s + r.amountCents, 0)
      const supplier = run[0]!.supplier
      out.push({
        rowType: "subtotal",
        itemCode: "",
        mediaType: "",
        supplier,
        detail: "",
        description: supplier ? `${supplier} subtotal` : "Subtotal",
        amountCents: cents,
        amount: cents / 100,
        lineCount: run.reduce((s, r) => s + r.lineCount, 0),
        planLineItemIds: [],
      })
    }
    i = j
  }
  return out
}

/** Cents sum of the `line` rows only (subtotals excluded). */
export function sumInvoiceLineRowsCents(rows: readonly InvoiceMediaRow[]): number {
  return rows.filter((r) => r.rowType === "line").reduce((s, r) => s + r.amountCents, 0)
}
