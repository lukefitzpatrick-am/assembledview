import ExcelJS from "exceljs"
import { format } from "date-fns"
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

const headerStyle = {
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
    rowIndex++

    const details: [string, string][] = [
      ["Client Name", campaign.clientName],
      ...(clientMeta
        ? ([
            ["Legal business name", displayMetaValue(clientMeta.legalBusinessName)],
            ["ABN", displayMetaValue(clientMeta.abn)],
          ] as [string, string][])
        : []),
      ["MBA Number", campaign.mbaNumber],
      ["PO Number", campaign.poNumber || "N/A"],
      ["Campaign Name", campaign.campaignName],
      ["Payment Days & Payment Terms", `${campaign.paymentDays} - ${campaign.paymentTerms}`],
      ["Invoice Date", format(new Date(campaign.invoiceDate), "dd/MM/yyyy")],
    ]

    details.forEach(([label, value]) => {
      worksheet.getCell(rowIndex, 1).value = label
      worksheet.getCell(rowIndex, 1).font = { bold: true }
      worksheet.getCell(rowIndex, 2).value = value
      rowIndex++
    })

    rowIndex++

    worksheet.getCell(rowIndex, 1).value = "Item Code"
    worksheet.getCell(rowIndex, 1).style = headerStyle
    worksheet.getCell(rowIndex, 2).value = "Media Type"
    worksheet.getCell(rowIndex, 2).style = headerStyle
    worksheet.getCell(rowIndex, 3).value = "Description"
    worksheet.getCell(rowIndex, 3).style = headerStyle
    worksheet.getCell(rowIndex, 4).value = "Amount"
    worksheet.getCell(rowIndex, 4).style = headerStyle
    rowIndex++

    campaign.lineItems.forEach((item) => {
      worksheet.getCell(rowIndex, 1).value = item.itemCode
      worksheet.getCell(rowIndex, 2).value = item.mediaType
      worksheet.getCell(rowIndex, 3).value = item.description
      worksheet.getCell(rowIndex, 4).value = item.amount
      worksheet.getCell(rowIndex, 4).numFmt = "$#,##0.00"
      rowIndex++
    })

    campaign.serviceRows.forEach((service) => {
      worksheet.getCell(rowIndex, 1).value = service.itemCode
      worksheet.getCell(rowIndex, 2).value = service.service
      worksheet.getCell(rowIndex, 4).value = service.amount
      worksheet.getCell(rowIndex, 4).numFmt = "$#,##0.00"
      rowIndex++
    })

    worksheet.mergeCells(rowIndex, 1, rowIndex, 3)
    worksheet.getCell(rowIndex, 1).value = "Total"
    worksheet.getCell(rowIndex, 1).font = { bold: true }
    worksheet.getCell(rowIndex, 4).value = campaign.total
    worksheet.getCell(rowIndex, 4).numFmt = "$#,##0.00"
    worksheet.getCell(rowIndex, 4).font = { bold: true }
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
    rowIndex++

    const details: [string, string][] = [
      ["Client Name", campaign.clientName],
      ...(clientMeta
        ? ([
            ["Legal business name", displayMetaValue(clientMeta.legalBusinessName)],
            ["ABN", displayMetaValue(clientMeta.abn)],
          ] as [string, string][])
        : []),
      ["Scope ID", campaign.mbaNumber],
      ["Scope Name", campaign.campaignName],
      ["Payment Days & Payment Terms", `${campaign.paymentDays} - ${campaign.paymentTerms}`],
      ["Invoice Date", format(new Date(campaign.invoiceDate), "dd/MM/yyyy")],
    ]

    details.forEach(([label, value]) => {
      worksheet.getCell(rowIndex, 1).value = label
      worksheet.getCell(rowIndex, 1).font = { bold: true }
      worksheet.getCell(rowIndex, 2).value = value
      rowIndex++
    })

    rowIndex++

    worksheet.getCell(rowIndex, 1).value = "Item Code"
    worksheet.getCell(rowIndex, 1).style = headerStyle
    worksheet.getCell(rowIndex, 2).value = "Type"
    worksheet.getCell(rowIndex, 2).style = headerStyle
    worksheet.getCell(rowIndex, 3).value = "Description"
    worksheet.getCell(rowIndex, 3).style = headerStyle
    worksheet.getCell(rowIndex, 4).value = "Amount"
    worksheet.getCell(rowIndex, 4).style = headerStyle
    rowIndex++

    campaign.lineItems.forEach((item) => {
      worksheet.getCell(rowIndex, 1).value = item.itemCode
      worksheet.getCell(rowIndex, 2).value = item.mediaType
      worksheet.getCell(rowIndex, 3).value = item.description
      worksheet.getCell(rowIndex, 4).value = item.amount
      worksheet.getCell(rowIndex, 4).numFmt = "$#,##0.00"
      rowIndex++
    })

    campaign.serviceRows.forEach((service) => {
      worksheet.getCell(rowIndex, 1).value = service.itemCode
      worksheet.getCell(rowIndex, 2).value = service.service
      worksheet.getCell(rowIndex, 4).value = service.amount
      worksheet.getCell(rowIndex, 4).numFmt = "$#,##0.00"
      rowIndex++
    })

    worksheet.mergeCells(rowIndex, 1, rowIndex, 3)
    worksheet.getCell(rowIndex, 1).value = "Total"
    worksheet.getCell(rowIndex, 1).font = { bold: true }
    worksheet.getCell(rowIndex, 4).value = campaign.total
    worksheet.getCell(rowIndex, 4).numFmt = "$#,##0.00"
    worksheet.getCell(rowIndex, 4).font = { bold: true }
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
    worksheet.getCell(rowIndex, 1).value = label
    worksheet.getCell(rowIndex, 1).font = { bold: true }
    worksheet.getCell(rowIndex, 2).value = value
    rowIndex++
  })

  rowIndex++

  worksheet.getCell(rowIndex, 1).value = "Item Code"
  worksheet.getCell(rowIndex, 1).style = headerStyle
  worksheet.getCell(rowIndex, 2).value = "Media Type"
  worksheet.getCell(rowIndex, 2).style = headerStyle
  worksheet.getCell(rowIndex, 3).value = "Description"
  worksheet.getCell(rowIndex, 3).style = headerStyle
  worksheet.getCell(rowIndex, 4).value = "Amount"
  worksheet.getCell(rowIndex, 4).style = headerStyle
  rowIndex++

  worksheet.getCell(rowIndex, 1).value = "Retainer"
  worksheet.getCell(rowIndex, 2).value = "Retainer"
  worksheet.getCell(rowIndex, 3).value = "Monthly retainer"
  worksheet.getCell(rowIndex, 4).value = total
  worksheet.getCell(rowIndex, 4).numFmt = "$#,##0.00"
  rowIndex++

  worksheet.mergeCells(rowIndex, 1, rowIndex, 3)
  worksheet.getCell(rowIndex, 1).value = "Total"
  worksheet.getCell(rowIndex, 1).font = { bold: true }
  worksheet.getCell(rowIndex, 4).value = total
  worksheet.getCell(rowIndex, 4).numFmt = "$#,##0.00"
  worksheet.getCell(rowIndex, 4).font = { bold: true }
}

export async function workbookToXlsxBuffer(workbook: ExcelJS.Workbook): Promise<ArrayBuffer> {
  const buffer = await workbook.xlsx.writeBuffer()
  return buffer as ArrayBuffer
}
