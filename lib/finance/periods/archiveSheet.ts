/**
 * Run-items finance sheet — same workbook family as hub receivables export
 * + invoice_reference column. Archived immutably to private Blob.
 */

import { put } from "@vercel/blob"
import {
  financeSheetBlobPathname,
  financeSheetFilename,
} from "@/lib/finance/periods/naturalKeys"
import { effectiveAmountCents } from "@/lib/finance/periods/reviewItem"
import type { FinanceRunItem } from "@/lib/finance/periods/types"
import { toPeriodMonthKey } from "@/lib/finance/periods/monthKey"

export async function buildRunItemsWorkbookBuffer(
  items: FinanceRunItem[],
  periodMonth: string,
  sheetVersion: number
): Promise<Buffer> {
  const ExcelJS = (await import("exceljs")).default
  const workbook = new ExcelJS.Workbook()
  const ws = workbook.addWorksheet(sheetVersion <= 1 ? "Finance run" : `Finance run v${sheetVersion}`)

  ws.addRow([
    "Source",
    "Invoice reference",
    "MBA / client",
    "Status",
    "Amount (ex GST)",
    "Adjustment",
    "Effective",
    "Hold / exclude reason",
  ])
  for (const item of items) {
    if (item.status === "excluded") continue
    const adj =
      item.status === "adjusted" && item.adjustmentCents != null
        ? item.adjustmentCents / 100
        : ""
    ws.addRow([
      item.source,
      item.invoiceReference,
      item.mbaNumber || (item.clientId != null ? `client:${item.clientId}` : ""),
      item.status,
      item.amountCents / 100,
      adj,
      effectiveAmountCents(item) / 100,
      item.holdReason || item.excludeReason || item.adjustmentReason || "",
    ])
  }

  // Label amended sheets clearly
  if (sheetVersion > 1) {
    ws.insertRow(1, [
      `AMENDED AFTER LOCK — v${sheetVersion} — period ${toPeriodMonthKey(periodMonth)} — original archive unchanged`,
    ])
  }

  const buf = await workbook.xlsx.writeBuffer()
  return Buffer.from(buf)
}

export async function archiveFinanceSheet(args: {
  items: FinanceRunItem[]
  periodMonth: string
  sheetVersion: number
  /** Injected for tests — skip Blob. */
  putBlob?: (pathname: string, body: Buffer) => Promise<{ pathname: string; url: string }>
}): Promise<{ pathname: string; filename: string; url: string | null }> {
  const filename = financeSheetFilename(args.periodMonth, args.sheetVersion)
  const pathname = financeSheetBlobPathname(args.periodMonth, args.sheetVersion)
  const body = await buildRunItemsWorkbookBuffer(
    args.items,
    args.periodMonth,
    args.sheetVersion
  )

  if (args.putBlob) {
    const r = await args.putBlob(pathname, body)
    return { pathname: r.pathname, filename, url: r.url }
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (!token) {
    // Shadow / local without blob — still return pathname for bookkeeping
    return { pathname, filename, url: null }
  }

  const blob = await put(pathname, body, {
    access: "private",
    token,
    addRandomSuffix: false,
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })
  return { pathname: blob.pathname, filename, url: blob.url }
}
