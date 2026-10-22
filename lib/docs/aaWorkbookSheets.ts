/**
 * Extra sheets on the AA media-plan workbook only.
 * Monthly dollars are the same prorated shares the Media Plan month cells use.
 */
import type ExcelJS from "exceljs"

import { getScheduleHeaders } from "@/lib/billing/scheduleHeaders"
import { dollarsFromPartCents } from "@/lib/docs/allocateLineAcrossMonths"
import { BRAND, hexToArgb } from "@/lib/brand"
import type { LineItem, MediaItems } from "@/lib/generateMediaPlan"

export const AA_SUPPLIER_SHEET = "Monthly by supplier"
export const AA_INSERTIONS_SHEET = "Insertions"

const ARGB_INK = hexToArgb(BRAND.colour.ink)
const ARGB_SAND = hexToArgb(BRAND.colour.sand)
const ARGB_LIME = hexToArgb(BRAND.colour.lime)

const NETWORK_SUPPLIER = new Set([
  "television",
  "radio",
  "newspaper",
  "magazines",
  "ooh",
  "cinema",
])

const PLATFORM_SUPPLIER = new Set([
  "search",
  "socialMedia",
  "digiDisplay",
  "digiAudio",
  "digiVideo",
  "bvod",
  "progDisplay",
  "progVideo",
  "progBvod",
  "progAudio",
  "progOoh",
  "integration",
  "influencers",
])

const INSERTION_MEDIA: { key: keyof MediaItems; label: string; scheduleKey: string }[] = [
  { key: "television", label: "Television", scheduleKey: "television" },
  { key: "radio", label: "Radio", scheduleKey: "radio" },
  { key: "newspaper", label: "Newspaper", scheduleKey: "newspaper" },
  { key: "magazines", label: "Magazines", scheduleKey: "magazines" },
  { key: "ooh", label: "OOH", scheduleKey: "ooh" },
  { key: "cinema", label: "Cinema", scheduleKey: "cinema" },
]

const MEDIA_LABEL: Record<string, string> = {
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
  search: "Search",
  socialMedia: "Social Media",
  progDisplay: "Programmatic Display",
  progVideo: "Programmatic Video",
  progBvod: "Programmatic BVOD",
  progAudio: "Programmatic Audio",
  progOoh: "Programmatic OOH",
  integration: "Integration",
  influencers: "Influencers",
  production: "Production",
}

export const AA_MEDIA_KEY_ORDER = [
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
] as const

export function aaSupplierName(
  mediaKey: string,
  item: { network?: string; platform?: string },
): string {
  if (NETWORK_SUPPLIER.has(mediaKey)) return String(item.network ?? "").trim()
  if (PLATFORM_SUPPLIER.has(mediaKey)) return String(item.platform ?? "").trim()
  return String(item.network || item.platform || "").trim()
}

/** Media types split by bid strategy on the supplier sheet (not targeting). */
const BID_STRATEGY_FORMAT = new Set([
  "search",
  "socialMedia",
  "progDisplay",
  "progVideo",
  "progBvod",
  "progAudio",
  "progOoh",
])

/** snake_case codes and single lowercase words read as sentence case. */
export function aaReadableLabel(value: unknown): string {
  const text = String(value ?? "").trim()
  if (/^[a-z0-9]+(_[a-z0-9]+)+$/.test(text) || /^[a-z]+$/.test(text)) {
    const spaced = text.replace(/_/g, " ")
    return spaced.charAt(0).toUpperCase() + spaced.slice(1)
  }
  return text
}

/**
 * Second key on the AA supplier sheet and the Insertions format column.
 * Search, social and programmatic use bid strategy; production has none;
 * everything else uses the schedule header2 (format, title, station, site).
 */
export function aaFormatLabel(mediaKey: string, item: LineItem): string {
  if (mediaKey === "production") return ""
  if (BID_STRATEGY_FORMAT.has(mediaKey)) {
    const o = item as LineItem & { bid_strategy?: string }
    return aaReadableLabel(o.bidStrategy ?? o.bid_strategy ?? "")
  }
  return aaReadableLabel(getScheduleHeaders(mediaKey, item).header2)
}

/** mediaKey -> supplier -> format or title -> month -> dollars. */
export type AaMonthlyBySupplier = Record<
  string,
  Record<string, Record<string, Record<string, number>>>
>

function lineIsClientPays(item: LineItem): boolean {
  const o = item as LineItem & { client_pays_for_media?: boolean }
  return o.clientPaysForMedia === true || o.client_pays_for_media === true
}

function moneyNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  const n = parseFloat(String(value ?? "").replace(/[^0-9.-]+/g, ""))
  return Number.isFinite(n) ? n : 0
}

function isBonusBuyType(buyType: string | undefined): boolean {
  return String(buyType ?? "").trim().toLowerCase() === "bonus"
}

function utcCivilDate(ymd: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null
  const [year, month, day] = ymd.split("-").map(Number)
  return new Date(Date.UTC(year!, month! - 1, day))
}

/** Monday on or before the civil start date. Sunday walks back six days. */
export function weekCommencingMonday(ymd: string): Date | null {
  const date = utcCivilDate(ymd)
  if (!date) return null
  const day = date.getUTCDay()
  const back = day === 0 ? 6 : day - 1
  const monday = new Date(date.getTime())
  monday.setUTCDate(date.getUTCDate() - back)
  return monday
}

function lineId(item: LineItem): string {
  const raw = item.line_item_id ?? item.lineItemId ?? item.line_item ?? item.lineItem
  return raw == null ? "" : String(raw)
}

function applyPrint(ws: ExcelJS.Worksheet): void {
  ws.pageSetup = {
    ...ws.pageSetup,
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    printTitlesRow: "1:1",
  }
  ws.pageSetup.fitToWidth = 1
  ws.pageSetup.fitToHeight = 0
  ws.views = [{ state: "frozen", ySplit: 1, showGridLines: false }]
}

function paintHeader(cell: ExcelJS.Cell, value: string): void {
  cell.value = value
  cell.font = { name: BRAND.font.excel, size: 12, bold: true, color: { argb: ARGB_INK } }
  cell.alignment = { horizontal: "left", vertical: "middle" }
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ARGB_SAND } }
}

function paintText(cell: ExcelJS.Cell, value: string, bold = false): void {
  cell.value = value
  cell.font = { name: BRAND.font.excel, size: 12, bold, color: { argb: ARGB_INK } }
  cell.alignment = { horizontal: "left", vertical: "middle" }
}

function paintMoney(cell: ExcelJS.Cell, value: number, bold = false, fill?: string): void {
  cell.value = value
  cell.numFmt = "$#,##0.00"
  cell.font = { name: BRAND.font.excel, size: 12, bold, color: { argb: ARGB_INK } }
  cell.alignment = { horizontal: "right", vertical: "middle" }
  if (fill) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } }
}

function paintDate(cell: ExcelJS.Cell, value: Date | null): void {
  cell.value = value
  cell.numFmt = "d/mm/yyyy"
  cell.font = { name: BRAND.font.excel, size: 12, color: { argb: ARGB_INK } }
  cell.alignment = { horizontal: "left", vertical: "middle" }
}

function monthTotal(months: Record<string, number> | undefined, month: string): number {
  return months?.[month] ?? 0
}

function rowTotal(months: Record<string, number> | undefined, monthKeys: readonly string[]): number {
  return dollarsFromPartCents(monthKeys.map((month) => monthTotal(months, month)))
}

export function addAaWorkbookSheets(
  workbook: ExcelJS.Workbook,
  args: {
    monthKeys: readonly string[]
    monthlyByChannel: Record<string, Record<string, number>>
    monthlyBySupplier: AaMonthlyBySupplier
    mediaItems: MediaItems
  },
): void {
  addSupplierSheet(workbook, args)
  addInsertionsSheet(workbook, args.mediaItems)
}

function addSupplierSheet(
  workbook: ExcelJS.Workbook,
  args: {
    monthKeys: readonly string[]
    monthlyByChannel: Record<string, Record<string, number>>
    monthlyBySupplier: AaMonthlyBySupplier
  },
): void {
  const ws = workbook.addWorksheet(AA_SUPPLIER_SHEET)
  const monthKeys = args.monthKeys
  const headers = ["Media type", "Supplier", "Format or title", ...monthKeys, "Total"]
  const firstMonthCol = 4
  headers.forEach((label, index) => paintHeader(ws.getCell(1, index + 1), label))
  ws.getRow(1).height = 22
  ws.getColumn(1).width = 24
  ws.getColumn(2).width = 28
  ws.getColumn(3).width = 30
  for (let c = firstMonthCol; c <= headers.length; c++) ws.getColumn(c).width = 16

  let row = 2
  const grandByMonth: Record<string, number> = {}
  for (const month of monthKeys) {
    let gross = 0
    let production = 0
    for (const [key, months] of Object.entries(args.monthlyByChannel)) {
      const amount = months[month] ?? 0
      if (key === "production") production += amount
      else gross += amount
    }
    grandByMonth[month] = dollarsFromPartCents([gross, production])
  }

  for (const mediaKey of AA_MEDIA_KEY_ORDER) {
    const suppliers = args.monthlyBySupplier[mediaKey]
    if (!suppliers || Object.keys(suppliers).length === 0) continue
    const names = Object.keys(suppliers).sort((a, b) => a.localeCompare(b))
    const label = MEDIA_LABEL[mediaKey] ?? mediaKey
    for (const name of names) {
      const formats = suppliers[name] ?? {}
      const formatNames = Object.keys(formats).sort((a, b) => a.localeCompare(b))
      for (const format of formatNames) {
        const months = formats[format] ?? {}
        paintText(ws.getCell(row, 1), label)
        paintText(ws.getCell(row, 2), name)
        paintText(ws.getCell(row, 3), format)
        monthKeys.forEach((month, index) => {
          paintMoney(ws.getCell(row, firstMonthCol + index), monthTotal(months, month))
        })
        paintMoney(ws.getCell(row, firstMonthCol + monthKeys.length), rowTotal(months, monthKeys))
        row++
      }
    }
    const channel = args.monthlyByChannel[mediaKey]
    paintText(ws.getCell(row, 1), label, true)
    paintText(ws.getCell(row, 2), "Subtotal", true)
    paintText(ws.getCell(row, 3), "", true)
    monthKeys.forEach((month, index) => {
      paintMoney(ws.getCell(row, firstMonthCol + index), monthTotal(channel, month), true, ARGB_SAND)
    })
    paintMoney(
      ws.getCell(row, firstMonthCol + monthKeys.length),
      rowTotal(channel, monthKeys),
      true,
      ARGB_SAND,
    )
    row++
  }

  paintText(ws.getCell(row, 1), "Total", true)
  paintText(ws.getCell(row, 2), "", true)
  paintText(ws.getCell(row, 3), "", true)
  monthKeys.forEach((month, index) => {
    paintMoney(ws.getCell(row, firstMonthCol + index), grandByMonth[month] ?? 0, true, ARGB_LIME)
  })
  paintMoney(
    ws.getCell(row, firstMonthCol + monthKeys.length),
    dollarsFromPartCents(monthKeys.map((month) => grandByMonth[month] ?? 0)),
    true,
    ARGB_LIME,
  )
  applyPrint(ws)
}

function addInsertionsSheet(workbook: ExcelJS.Workbook, mediaItems: MediaItems): void {
  const ws = workbook.addWorksheet(AA_INSERTIONS_SHEET)
  const headers = [
    "Line ID",
    "Media type",
    "Supplier",
    "Station or publication or format",
    "Start date",
    "End date",
    "Week commencing",
    "Spot or insertion rate",
    "Quantity",
    "Amount",
    "Bonus",
  ]
  headers.forEach((label, index) => paintHeader(ws.getCell(1, index + 1), label))
  ws.getRow(1).height = 22
  const widths = [18, 16, 28, 36, 14, 14, 18, 22, 12, 14, 10]
  widths.forEach((width, index) => {
    ws.getColumn(index + 1).width = width
  })

  let row = 2
  for (const media of INSERTION_MEDIA) {
    const items = mediaItems[media.key] ?? []
    for (const item of items) {
      if (lineIsClientPays(item)) continue
      const bonus = isBonusBuyType(item.buyType)
      paintText(ws.getCell(row, 1), lineId(item))
      paintText(ws.getCell(row, 2), media.label)
      paintText(ws.getCell(row, 3), aaSupplierName(media.scheduleKey, item))
      paintText(ws.getCell(row, 4), aaFormatLabel(media.scheduleKey, item))
      paintDate(ws.getCell(row, 5), utcCivilDate(item.startDate))
      paintDate(ws.getCell(row, 6), utcCivilDate(item.endDate))
      paintDate(ws.getCell(row, 7), weekCommencingMonday(item.startDate))
      paintMoney(ws.getCell(row, 8), moneyNumber(item.buyAmount))
      const qty = ws.getCell(row, 9)
      qty.value = moneyNumber(item.deliverables)
      qty.numFmt = "#,##0"
      qty.font = { name: BRAND.font.excel, size: 12, color: { argb: ARGB_INK } }
      qty.alignment = { horizontal: "right", vertical: "middle" }
      paintMoney(ws.getCell(row, 10), bonus ? 0 : moneyNumber(item.grossMedia))
      paintText(ws.getCell(row, 11), bonus ? "Yes" : "")
      row++
    }
  }
  applyPrint(ws)
}
