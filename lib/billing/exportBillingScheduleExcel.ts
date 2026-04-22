import ExcelJS from "exceljs"
import { parseCurrency } from "@/lib/mediaplan/partialMba"
import { getMediaTypeHeadersForSchedule } from "@/lib/billing/mediaTypeHeaders"
import type { BillingLineItem, BillingMonth } from "@/lib/billing/types"

const BILLING_MEDIA_LABELS: Record<string, string> = {
  television: "Television",
  radio: "Radio",
  newspaper: "Newspaper",
  magazines: "Magazines",
  ooh: "OOH",
  cinema: "Cinema",
  digiDisplay: "Digital Display",
  digiAudio: "Digital Audio",
  digiVideo: "Digital Video",
  bvod: "BVOD",
  integration: "Integration",
  search: "Search",
  socialMedia: "Social Media",
  progDisplay: "Programmatic Display",
  progVideo: "Programmatic Video",
  progBvod: "Programmatic BVOD",
  progAudio: "Programmatic Audio",
  progOoh: "Programmatic OOH",
  influencers: "Influencers",
  production: "Production",
}

const BILLING_MEDIA_TINTS: Record<string, string> = {
  television: "FFD6E4F5",
  radio: "FFE8D5F5",
  newspaper: "FFD6DEE1",
  magazines: "FFF5D0E0",
  ooh: "FFF5D5C2",
  cinema: "FFF5C2C2",
  digiDisplay: "FFC8E6E3",
  digiAudio: "FFCFD8F5",
  digiVideo: "FFD9D1F5",
  bvod: "FFFDE8C0",
  integration: "FFC8E6C9",
  search: "FFC8E6C9",
  socialMedia: "FFCCE0F5",
  progDisplay: "FFD1D5D8",
  progVideo: "FFD3CCF0",
  progBvod: "FFFDE8A8",
  progAudio: "FFF5D0C5",
  progOoh: "FFD7E8C8",
  influencers: "FFF2CCDC",
  production: "FFD8CEC9",
}

const MEDIA_SECTION_ORDER: string[] = [
  "television",
  "radio",
  "newspaper",
  "magazines",
  "ooh",
  "cinema",
  "digiDisplay",
  "digiAudio",
  "digiVideo",
  "bvod",
  "search",
  "socialMedia",
  "progDisplay",
  "progVideo",
  "progBvod",
  "progAudio",
  "progOoh",
  "integration",
  "influencers",
  "production",
]

export type BillingScheduleExcelMeta = {
  client: string
  brand: string
  campaignName: string
  mbaNumber?: string
  planVersion?: string
  campaignStartLabel?: string
  campaignEndLabel?: string
}

const greyFill: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F2F2" } }
const currencyFmt = '"$"#,##0.00'

function styleCell(
  cell: ExcelJS.Cell,
  options: Partial<{
    value: ExcelJS.CellValue
    fontSize: number
    bold: boolean
    align: "left" | "right" | "center"
    verticalAlign: "top" | "middle" | "bottom"
    fill: ExcelJS.Fill
    numFmt: string
    wrapText: boolean
  }>
) {
  if (options.value !== undefined) cell.value = options.value
  cell.font = {
    name: "Aptos",
    size: options.fontSize ?? 11,
    bold: options.bold ?? false,
  }
  cell.alignment = {
    horizontal: options.align ?? "left",
    vertical: options.verticalAlign ?? "middle",
    wrapText: options.wrapText ?? false,
  }
  if (options.fill) cell.fill = options.fill
  if (options.numFmt) cell.numFmt = options.numFmt
}

function lineItemsForMedia(months: BillingMonth[], mediaKey: string): BillingLineItem[] {
  const first = months[0]
  const list = first?.lineItems?.[mediaKey as keyof NonNullable<BillingMonth["lineItems"]>] as
    | BillingLineItem[]
    | undefined
  return Array.isArray(list) ? list : []
}

function collectMediaKeysWithLineItems(months: BillingMonth[]): string[] {
  const keys = new Set<string>()
  for (const m of months) {
    if (!m.lineItems) continue
    for (const k of Object.keys(m.lineItems)) {
      const arr = m.lineItems[k as keyof typeof m.lineItems] as BillingLineItem[] | undefined
      if (Array.isArray(arr) && arr.length > 0) keys.add(k)
    }
  }
  return MEDIA_SECTION_ORDER.filter((k) => keys.has(k))
}

export function sanitizeFilenamePart(s: string): string {
  return String(s || "Plan")
    .replace(/[<>:"/\\|?*]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || "Plan"
}

export async function buildBillingScheduleExcelBlob(
  months: BillingMonth[],
  meta: BillingScheduleExcelMeta
): Promise<Blob> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet("Billing Schedule", {
    views: [{ state: "normal", showGridLines: false }],
  })

  let r = 1
  sheet.mergeCells(r, 2, r, 4)
  const titleCell = sheet.getCell(r, 2)
  styleCell(titleCell, { value: "Billing Schedule", fontSize: 22, bold: true, align: "left" })
  r += 2

  const labelRows: [string, string][] = [
    ["Client", meta.client || ""],
    ["Brand", meta.brand || ""],
    ["Campaign", meta.campaignName || ""],
    ["MBA Number", meta.mbaNumber || ""],
    ["Plan Version", meta.planVersion || ""],
    ["Campaign Start", meta.campaignStartLabel || ""],
    ["Campaign End", meta.campaignEndLabel || ""],
  ]
  for (const [label, val] of labelRows) {
    styleCell(sheet.getCell(r, 2), { value: label, bold: true, align: "right", fontSize: 11 })
    styleCell(sheet.getCell(r, 3), { value: val, align: "left", fontSize: 11, fill: greyFill })
    r++
  }

  r += 1
  const monthKeys = months.map((m) => m.monthYear)
  const colCount = 3 + monthKeys.length + 1

  const mediaKeys = collectMediaKeysWithLineItems(months)

  for (const mediaKey of mediaKeys) {
    const items = lineItemsForMedia(months, mediaKey)
    if (items.length === 0) continue

    const bandFill: ExcelJS.Fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: BILLING_MEDIA_TINTS[mediaKey] ?? "FFE8E8E8" },
    }
    sheet.mergeCells(r, 2, r, colCount)
    styleCell(sheet.getCell(r, 2), {
      value: BILLING_MEDIA_LABELS[mediaKey] ?? mediaKey,
      bold: true,
      fontSize: 12,
      fill: bandFill,
      align: "left",
    })
    r++

    const { header1: h1Label, header2: h2Label } = getMediaTypeHeadersForSchedule(mediaKey)
    styleCell(sheet.getCell(r, 2), { value: h1Label, bold: true, align: "left", fontSize: 10 })
    styleCell(sheet.getCell(r, 3), { value: h2Label, bold: true, align: "left", fontSize: 10 })
    let c = 4
    for (const mk of monthKeys) {
      styleCell(sheet.getCell(r, c), { value: mk, bold: true, align: "right", fontSize: 10 })
      c++
    }
    styleCell(sheet.getCell(r, c), { value: "Total", bold: true, align: "right", fontSize: 10 })
    r++

    const subtotals: number[] = monthKeys.map(() => 0)
    let subGrand = 0

    for (const li of items) {
      styleCell(sheet.getCell(r, 2), { value: li.header1 ?? "", align: "left", fontSize: 10 })
      styleCell(sheet.getCell(r, 3), { value: li.header2 ?? "", align: "left", fontSize: 10 })
      c = 4
      let lineSum = 0
      monthKeys.forEach((mk, i) => {
        const v = li.monthlyAmounts?.[mk] ?? 0
        lineSum += v
        subtotals[i] += v
        styleCell(sheet.getCell(r, c), { value: v, align: "right", fontSize: 10, numFmt: currencyFmt })
        c++
      })
      subGrand += li.totalAmount ?? lineSum
      styleCell(sheet.getCell(r, c), {
        value: li.totalAmount ?? lineSum,
        align: "right",
        bold: true,
        fontSize: 10,
        numFmt: currencyFmt,
      })
      r++
    }

    styleCell(sheet.getCell(r, 2), { value: "Subtotal", bold: true, align: "left", fontSize: 10 })
    styleCell(sheet.getCell(r, 3), { value: "", align: "left", fontSize: 10 })
    c = 4
    monthKeys.forEach((_, i) => {
      styleCell(sheet.getCell(r, c), {
        value: subtotals[i],
        bold: true,
        align: "right",
        fontSize: 10,
        numFmt: currencyFmt,
      })
      c++
    })
    styleCell(sheet.getCell(r, c), {
      value: subGrand,
      bold: true,
      align: "right",
      fontSize: 10,
      numFmt: currencyFmt,
    })
    r += 2
  }

  // Fees, Ad Serving, Production
  styleCell(sheet.getCell(r, 2), {
    value: "Fees, Ad Serving & Production",
    bold: true,
    fontSize: 12,
    fill: greyFill,
    align: "left",
  })
  sheet.mergeCells(r, 2, r, colCount)
  r++

  styleCell(sheet.getCell(r, 2), { value: "Type", bold: true, fontSize: 10 })
  styleCell(sheet.getCell(r, 3), { value: "Details", bold: true, fontSize: 10 })
  let c = 4
  for (const mk of monthKeys) {
    styleCell(sheet.getCell(r, c), { value: mk, bold: true, align: "right", fontSize: 10 })
    c++
  }
  styleCell(sheet.getCell(r, c), { value: "Total", bold: true, align: "right", fontSize: 10 })
  r++

  const costRows: { label: string; detail: string; pick: (m: BillingMonth) => string }[] = [
    { label: "Fees", detail: "Total", pick: (m) => m.feeTotal },
    { label: "Ad Serving", detail: "Tech fees", pick: (m) => m.adservingTechFees },
    { label: "Production", detail: "Total", pick: (m) => m.production || "$0" },
  ]

  for (const row of costRows) {
    styleCell(sheet.getCell(r, 2), { value: row.label, align: "left", fontSize: 10 })
    styleCell(sheet.getCell(r, 3), { value: row.detail, align: "left", fontSize: 10 })
    c = 4
    let rowTot = 0
    for (const m of months) {
      const v = parseCurrency(row.pick(m))
      rowTot += v
      styleCell(sheet.getCell(r, c), { value: v, align: "right", fontSize: 10, numFmt: currencyFmt })
      c++
    }
    styleCell(sheet.getCell(r, c), { value: rowTot, align: "right", bold: true, fontSize: 10, numFmt: currencyFmt })
    r++
  }

  r += 1
  styleCell(sheet.getCell(r, 2), { value: "Grand total", bold: true, fontSize: 12, align: "left" })
  styleCell(sheet.getCell(r, 3), { value: "", align: "left", fontSize: 12 })
  c = 4
  let overall = 0
  for (const m of months) {
    const v = parseCurrency(m.totalAmount)
    overall += v
    styleCell(sheet.getCell(r, c), { value: v, bold: true, align: "right", fontSize: 11, numFmt: currencyFmt })
    c++
  }
  styleCell(sheet.getCell(r, c), { value: overall, bold: true, align: "right", fontSize: 11, numFmt: currencyFmt })

  sheet.getColumn(2).width = 18
  sheet.getColumn(3).width = 28
  for (let i = 4; i <= 3 + monthKeys.length; i++) {
    sheet.getColumn(i).width = 14
  }
  sheet.getColumn(4 + monthKeys.length).width = 14

  const buffer = await workbook.xlsx.writeBuffer()
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })
}
