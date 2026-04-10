import ExcelJS from "exceljs"
import { format } from "date-fns"
import type { BillingRecord } from "@/lib/types/financeBilling"
import type { FinanceCampaignData } from "@/lib/finance/utils"

/** When set (e.g. client hub export), legal business name and ABN appear under client name on each section. */
export type FinanceExcelClientMeta = {
  legalBusinessName: string
  abn: string
}

function displayMetaValue(value: string): string {
  const t = value.trim()
  return t.length > 0 ? t : "N/A"
}

/** Parse a row from `GET /api/clients` for Excel legal header lines. */
export function clientApiRowToFinanceExcelMeta(row: Record<string, unknown>): FinanceExcelClientMeta {
  const legalRaw = row.legalbusinessname ?? row.legalBusinessName
  const legal = typeof legalRaw === "string" ? legalRaw.trim() : ""
  const v = row.abn
  const abn = v == null ? "" : typeof v === "string" ? v.trim() : String(v).trim()
  return { legalBusinessName: legal, abn }
}

export async function fetchFinanceHubClientMetaByClientId(): Promise<Map<number, FinanceExcelClientMeta>> {
  if (typeof fetch === "undefined") return new Map()
  try {
    const res = await fetch("/api/clients")
    if (!res.ok) return new Map()
    const data = (await res.json()) as unknown
    const map = new Map<number, FinanceExcelClientMeta>()
    if (!Array.isArray(data)) return map
    for (const raw of data) {
      if (!raw || typeof raw !== "object") continue
      const r = raw as Record<string, unknown>
      const id = Number(r.id)
      if (!Number.isFinite(id) || id <= 0) continue
      map.set(id, clientApiRowToFinanceExcelMeta(r))
    }
    return map
  } catch {
    return new Map()
  }
}

function legalDetailRowsForCampaign(
  campaign: FinanceCampaignData,
  clientMeta?: FinanceExcelClientMeta | null
): [string, string][] {
  if (campaign.legalBusinessName !== undefined || campaign.abn !== undefined) {
    return [
      ["Legal business name", displayMetaValue(campaign.legalBusinessName ?? "")],
      ["ABN", displayMetaValue(campaign.abn ?? "")],
    ]
  }
  if (clientMeta) {
    return [
      ["Legal business name", displayMetaValue(clientMeta.legalBusinessName)],
      ["ABN", displayMetaValue(clientMeta.abn)],
    ]
  }
  return []
}

/** Avoid Excel default / merged-cell behaviour that spaces out ALL-CAPS text (distributed / justify). */
const TEXT_ALIGNMENT: Partial<ExcelJS.Alignment> = {
  horizontal: "left",
  vertical: "middle",
  wrapText: true,
}

const AMOUNT_ALIGNMENT: Partial<ExcelJS.Alignment> = {
  horizontal: "right",
  vertical: "middle",
  wrapText: true,
}

const AMOUNT_HEADER_ALIGNMENT: Partial<ExcelJS.Alignment> = {
  horizontal: "center",
  vertical: "middle",
  wrapText: true,
}

const headerStyle: Partial<ExcelJS.Style> = {
  font: { bold: true, size: 12 },
  fill: {
    type: "pattern" as const,
    pattern: "solid" as const,
    fgColor: { argb: "FFE0E0E0" },
  },
  border: {
    top: { style: "thin" as const },
    bottom: { style: "thin" as const },
    left: { style: "thin" as const },
    right: { style: "thin" as const },
  },
  alignment: TEXT_ALIGNMENT,
}

const amountColumnHeaderStyle: Partial<ExcelJS.Style> = {
  ...headerStyle,
  alignment: AMOUNT_HEADER_ALIGNMENT,
}

/**
 * Same layout as Finance → Media → Export to Excel.
 */
export async function writeMediaFinanceWorksheet(
  workbook: ExcelJS.Workbook,
  sheetName: string,
  campaigns: FinanceCampaignData[],
  clientMeta?: FinanceExcelClientMeta | null
): Promise<void> {
  const worksheet = workbook.addWorksheet(sheetName)

  worksheet.columns = [
    { width: 20 },
    { width: 25 },
    { width: 40 },
    { width: 15 },
  ]

  let rowIndex = 1

  campaigns.forEach((campaign) => {
    worksheet.mergeCells(rowIndex, 1, rowIndex, 4)
    const headerCell = worksheet.getCell(rowIndex, 1)
    headerCell.value = `${campaign.clientName} - ${campaign.campaignName} (${campaign.mbaNumber})`
    headerCell.font = { bold: true, size: 14 }
    headerCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFD0D0D0" },
    }
    headerCell.alignment = TEXT_ALIGNMENT
    rowIndex++

    const details: [string, string][] = [
      ["Client Name", campaign.clientName],
      ...legalDetailRowsForCampaign(campaign, clientMeta),
      ["MBA Number", campaign.mbaNumber],
      ["PO Number", campaign.poNumber || "N/A"],
      ["Campaign Name", campaign.campaignName],
      ["Payment Days & Payment Terms", `${campaign.paymentDays} - ${campaign.paymentTerms}`],
      ["Invoice Date", format(new Date(campaign.invoiceDate), "dd/MM/yyyy")],
    ]

    details.forEach(([label, value]) => {
      const labelCell = worksheet.getCell(rowIndex, 1)
      labelCell.value = label
      labelCell.font = { bold: true }
      labelCell.alignment = TEXT_ALIGNMENT
      const valueCell = worksheet.getCell(rowIndex, 2)
      valueCell.value = value
      valueCell.alignment = TEXT_ALIGNMENT
      rowIndex++
    })

    rowIndex++

    worksheet.getCell(rowIndex, 1).value = "Item Code"
    worksheet.getCell(rowIndex, 1).style = headerStyle as ExcelJS.Style
    worksheet.getCell(rowIndex, 2).value = "Media Type"
    worksheet.getCell(rowIndex, 2).style = headerStyle as ExcelJS.Style
    worksheet.getCell(rowIndex, 3).value = "Description"
    worksheet.getCell(rowIndex, 3).style = headerStyle as ExcelJS.Style
    worksheet.getCell(rowIndex, 4).value = "Amount"
    worksheet.getCell(rowIndex, 4).style = amountColumnHeaderStyle as ExcelJS.Style
    rowIndex++

    campaign.lineItems.forEach((item) => {
      worksheet.getCell(rowIndex, 1).value = item.itemCode
      worksheet.getCell(rowIndex, 1).alignment = TEXT_ALIGNMENT
      worksheet.getCell(rowIndex, 2).value = item.mediaType
      worksheet.getCell(rowIndex, 2).alignment = TEXT_ALIGNMENT
      worksheet.getCell(rowIndex, 3).value = item.description
      worksheet.getCell(rowIndex, 3).alignment = TEXT_ALIGNMENT
      worksheet.getCell(rowIndex, 4).value = item.amount
      worksheet.getCell(rowIndex, 4).alignment = AMOUNT_ALIGNMENT
      worksheet.getCell(rowIndex, 4).numFmt = "$#,##0.00"
      rowIndex++
    })

    campaign.serviceRows.forEach((service) => {
      worksheet.getCell(rowIndex, 1).value = service.itemCode
      worksheet.getCell(rowIndex, 1).alignment = TEXT_ALIGNMENT
      worksheet.getCell(rowIndex, 2).value = service.service
      worksheet.getCell(rowIndex, 2).alignment = TEXT_ALIGNMENT
      worksheet.getCell(rowIndex, 4).value = service.amount
      worksheet.getCell(rowIndex, 4).alignment = AMOUNT_ALIGNMENT
      worksheet.getCell(rowIndex, 4).numFmt = "$#,##0.00"
      rowIndex++
    })

    worksheet.mergeCells(rowIndex, 1, rowIndex, 3)
    const totalLabelCell = worksheet.getCell(rowIndex, 1)
    totalLabelCell.value = "Total"
    totalLabelCell.font = { bold: true }
    totalLabelCell.alignment = TEXT_ALIGNMENT
    const totalAmountCell = worksheet.getCell(rowIndex, 4)
    totalAmountCell.value = campaign.total
    totalAmountCell.alignment = AMOUNT_ALIGNMENT
    totalAmountCell.numFmt = "$#,##0.00"
    totalAmountCell.font = { bold: true }
    rowIndex++

    rowIndex += 2
  })
}

/**
 * Same layout as Finance → Scopes of Work → Export to Excel.
 */
export async function writeSowFinanceWorksheet(
  workbook: ExcelJS.Workbook,
  sheetName: string,
  campaigns: FinanceCampaignData[],
  clientMeta?: FinanceExcelClientMeta | null
): Promise<void> {
  const worksheet = workbook.addWorksheet(sheetName)

  worksheet.columns = [
    { width: 20 },
    { width: 25 },
    { width: 40 },
    { width: 15 },
  ]

  let rowIndex = 1

  campaigns.forEach((campaign) => {
    worksheet.mergeCells(rowIndex, 1, rowIndex, 4)
    const headerCell = worksheet.getCell(rowIndex, 1)
    headerCell.value = `${campaign.clientName} - ${campaign.campaignName} (${campaign.mbaNumber})`
    headerCell.font = { bold: true, size: 14 }
    headerCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFD0D0D0" },
    }
    headerCell.alignment = TEXT_ALIGNMENT
    rowIndex++

    const details: [string, string][] = [
      ["Client Name", campaign.clientName],
      ...legalDetailRowsForCampaign(campaign, clientMeta),
      ["Scope ID", campaign.mbaNumber],
      ["Scope Name", campaign.campaignName],
      ["Payment Days & Payment Terms", `${campaign.paymentDays} - ${campaign.paymentTerms}`],
      ["Invoice Date", format(new Date(campaign.invoiceDate), "dd/MM/yyyy")],
    ]

    details.forEach(([label, value]) => {
      const labelCell = worksheet.getCell(rowIndex, 1)
      labelCell.value = label
      labelCell.font = { bold: true }
      labelCell.alignment = TEXT_ALIGNMENT
      const valueCell = worksheet.getCell(rowIndex, 2)
      valueCell.value = value
      valueCell.alignment = TEXT_ALIGNMENT
      rowIndex++
    })

    rowIndex++

    worksheet.getCell(rowIndex, 1).value = "Item Code"
    worksheet.getCell(rowIndex, 1).style = headerStyle as ExcelJS.Style
    worksheet.getCell(rowIndex, 2).value = "Type"
    worksheet.getCell(rowIndex, 2).style = headerStyle as ExcelJS.Style
    worksheet.getCell(rowIndex, 3).value = "Description"
    worksheet.getCell(rowIndex, 3).style = headerStyle as ExcelJS.Style
    worksheet.getCell(rowIndex, 4).value = "Amount"
    worksheet.getCell(rowIndex, 4).style = amountColumnHeaderStyle as ExcelJS.Style
    rowIndex++

    campaign.lineItems.forEach((item) => {
      worksheet.getCell(rowIndex, 1).value = item.itemCode
      worksheet.getCell(rowIndex, 1).alignment = TEXT_ALIGNMENT
      worksheet.getCell(rowIndex, 2).value = item.mediaType
      worksheet.getCell(rowIndex, 2).alignment = TEXT_ALIGNMENT
      worksheet.getCell(rowIndex, 3).value = item.description
      worksheet.getCell(rowIndex, 3).alignment = TEXT_ALIGNMENT
      worksheet.getCell(rowIndex, 4).value = item.amount
      worksheet.getCell(rowIndex, 4).alignment = AMOUNT_ALIGNMENT
      worksheet.getCell(rowIndex, 4).numFmt = "$#,##0.00"
      rowIndex++
    })

    campaign.serviceRows.forEach((service) => {
      worksheet.getCell(rowIndex, 1).value = service.itemCode
      worksheet.getCell(rowIndex, 1).alignment = TEXT_ALIGNMENT
      worksheet.getCell(rowIndex, 2).value = service.service
      worksheet.getCell(rowIndex, 2).alignment = TEXT_ALIGNMENT
      worksheet.getCell(rowIndex, 4).value = service.amount
      worksheet.getCell(rowIndex, 4).alignment = AMOUNT_ALIGNMENT
      worksheet.getCell(rowIndex, 4).numFmt = "$#,##0.00"
      rowIndex++
    })

    worksheet.mergeCells(rowIndex, 1, rowIndex, 3)
    const sowTotalLabel = worksheet.getCell(rowIndex, 1)
    sowTotalLabel.value = "Total"
    sowTotalLabel.font = { bold: true }
    sowTotalLabel.alignment = TEXT_ALIGNMENT
    const sowTotalAmount = worksheet.getCell(rowIndex, 4)
    sowTotalAmount.value = campaign.total
    sowTotalAmount.alignment = AMOUNT_ALIGNMENT
    sowTotalAmount.numFmt = "$#,##0.00"
    sowTotalAmount.font = { bold: true }
    rowIndex += 3
  })
}

export type RetainerFinanceSheetInput = {
  clientName: string
  mbaIdentifier: string
  paymentDays: number
  paymentTerms: string
  invoiceDateIso: string
  monthlyRetainer: number
  /** From client record (Xano) when exporting from client hub */
  legalBusinessName?: string
  abn?: string
}

/**
 * Invoice-style sheet aligned with Finance media layout (retainers page has no export; this matches the same workbook style).
 */
export async function writeRetainerFinanceWorksheet(
  workbook: ExcelJS.Workbook,
  sheetName: string,
  input: RetainerFinanceSheetInput
): Promise<void> {
  const worksheet = workbook.addWorksheet(sheetName)
  worksheet.columns = [
    { width: 20 },
    { width: 25 },
    { width: 40 },
    { width: 15 },
  ]

  let rowIndex = 1
  const total = input.monthlyRetainer

  worksheet.mergeCells(rowIndex, 1, rowIndex, 4)
  const headerCell = worksheet.getCell(rowIndex, 1)
  headerCell.value = `${input.clientName} - Monthly retainer`
  headerCell.font = { bold: true, size: 14 }
  headerCell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFD0D0D0" },
  }
  headerCell.alignment = TEXT_ALIGNMENT
  rowIndex++

  const hasLegalMeta = input.legalBusinessName !== undefined || input.abn !== undefined
  const details: [string, string][] = [
    ["Client Name", input.clientName],
    ...(hasLegalMeta
      ? ([
          ["Legal business name", displayMetaValue(input.legalBusinessName ?? "")],
          ["ABN", displayMetaValue(input.abn ?? "")],
        ] as [string, string][])
      : []),
    ["MBA Identifier", input.mbaIdentifier || "N/A"],
    ["Payment Days & Payment Terms", `${input.paymentDays} - ${input.paymentTerms}`],
    ["Invoice Date", format(new Date(input.invoiceDateIso), "dd/MM/yyyy")],
  ]

  details.forEach(([label, value]) => {
    const labelCell = worksheet.getCell(rowIndex, 1)
    labelCell.value = label
    labelCell.font = { bold: true }
    labelCell.alignment = TEXT_ALIGNMENT
    const valueCell = worksheet.getCell(rowIndex, 2)
    valueCell.value = value
    valueCell.alignment = TEXT_ALIGNMENT
    rowIndex++
  })

  rowIndex++

  worksheet.getCell(rowIndex, 1).value = "Item Code"
  worksheet.getCell(rowIndex, 1).style = headerStyle as ExcelJS.Style
  worksheet.getCell(rowIndex, 2).value = "Media Type"
  worksheet.getCell(rowIndex, 2).style = headerStyle as ExcelJS.Style
  worksheet.getCell(rowIndex, 3).value = "Description"
  worksheet.getCell(rowIndex, 3).style = headerStyle as ExcelJS.Style
  worksheet.getCell(rowIndex, 4).value = "Amount"
  worksheet.getCell(rowIndex, 4).style = amountColumnHeaderStyle as ExcelJS.Style
  rowIndex++

  worksheet.getCell(rowIndex, 1).value = "Retainer"
  worksheet.getCell(rowIndex, 1).alignment = TEXT_ALIGNMENT
  worksheet.getCell(rowIndex, 2).value = "Retainer"
  worksheet.getCell(rowIndex, 2).alignment = TEXT_ALIGNMENT
  worksheet.getCell(rowIndex, 3).value = "Monthly retainer"
  worksheet.getCell(rowIndex, 3).alignment = TEXT_ALIGNMENT
  worksheet.getCell(rowIndex, 4).value = total
  worksheet.getCell(rowIndex, 4).alignment = AMOUNT_ALIGNMENT
  worksheet.getCell(rowIndex, 4).numFmt = "$#,##0.00"
  rowIndex++

  worksheet.mergeCells(rowIndex, 1, rowIndex, 3)
  const retainerTotalLabel = worksheet.getCell(rowIndex, 1)
  retainerTotalLabel.value = "Total"
  retainerTotalLabel.font = { bold: true }
  retainerTotalLabel.alignment = TEXT_ALIGNMENT
  const retainerTotalAmount = worksheet.getCell(rowIndex, 4)
  retainerTotalAmount.value = total
  retainerTotalAmount.alignment = AMOUNT_ALIGNMENT
  retainerTotalAmount.numFmt = "$#,##0.00"
  retainerTotalAmount.font = { bold: true }
}

export async function workbookToXlsxBuffer(workbook: ExcelJS.Workbook): Promise<ArrayBuffer> {
  const buffer = await workbook.xlsx.writeBuffer()
  return buffer as ArrayBuffer
}

function invoiceIsoForFinanceCampaign(r: BillingRecord): string {
  const inv = r.invoice_date?.trim()
  if (inv) return inv
  if (r.billing_month) return `${r.billing_month}-01`
  return new Date().toISOString().slice(0, 10)
}

export function billingRecordsToFinanceCampaigns(
  records: BillingRecord[],
  clientMetaByClientId?: Map<number, FinanceExcelClientMeta>
): { media: FinanceCampaignData[]; sow: FinanceCampaignData[] } {
  const toCampaign = (r: BillingRecord): FinanceCampaignData => {
    const line_items = r.line_items ?? []
    const meta = clientMetaByClientId?.get(r.clients_id)
    const legalBlock =
      clientMetaByClientId != null
        ? {
            legalBusinessName: meta?.legalBusinessName ?? "",
            abn: meta?.abn ?? "",
          }
        : {}
    return {
      clientName: r.client_name,
      mbaNumber: r.mba_number ?? "",
      poNumber: r.po_number ?? undefined,
      campaignName: r.campaign_name ?? "",
      paymentDays: r.payment_days,
      paymentTerms: r.payment_terms,
      invoiceDate: invoiceIsoForFinanceCampaign(r),
      lineItems: line_items
        .filter((li) => li.line_type === "media")
        .map((li) => ({
          itemCode: li.item_code,
          mediaType: li.media_type ?? "",
          description: li.description ?? "",
          amount: li.amount,
        })),
      serviceRows: line_items
        .filter((li) => li.line_type === "service")
        .map((li) => ({
          itemCode: li.item_code,
          service: li.description ?? "",
          amount: li.amount,
        })),
      total: r.total,
      ...legalBlock,
    }
  }

  const media = records.filter((r) => r.billing_type === "media").map(toCampaign)
  const sow = records.filter((r) => r.billing_type === "sow").map(toCampaign)
  return { media, sow }
}

export type FinanceHubWorkbookMonthGroup = {
  monthIso: string
  monthLabel: string
  records: BillingRecord[]
}

export async function buildFinanceHubWorkbook(
  monthGroups: FinanceHubWorkbookMonthGroup[]
): Promise<ArrayBuffer> {
  const clientMetaById = await fetchFinanceHubClientMetaByClientId()
  const workbook = new ExcelJS.Workbook()
  for (const group of monthGroups) {
    const { media, sow } = billingRecordsToFinanceCampaigns(group.records, clientMetaById)
    const safeMonth = group.monthLabel.replace(/[\\/?*\[\]:]/g, "")
    if (media.length > 0) {
      await writeMediaFinanceWorksheet(workbook, `Media ${safeMonth}`.slice(0, 31), media, null)
    }
    if (sow.length > 0) {
      await writeSowFinanceWorksheet(workbook, `SOW ${safeMonth}`.slice(0, 31), sow, null)
    }
  }
  if (workbook.worksheets.length === 0) {
    throw new Error("No media or SOW billing rows to export for the selected months.")
  }
  return workbookToXlsxBuffer(workbook)
}

