import type ExcelJS from "exceljs"

import type { MediaContainerBestPractice, Publisher } from "@/lib/types/publisher"

import { chosenPublishersFor, renderBestPracticeBlock } from "./bestPractice"
import {
  channelRows,
  collectSkippedLineItems,
  deriveChannelTabs,
  type ChannelDetailRow,
  type ChannelTab,
  type TokenOverrides,
} from "./channelTabs"
import {
  INVALID_NAME_CELL,
  NEEDS_INPUT_CELL,
  emptyRequiredFreeKeysOnly,
  tryComposeName,
} from "./exportTraffickingWorkbook"
import type { PlanGlobals } from "./fromPlan"
import { levelNeedsLineItemSeed, templatesForPlatform } from "./fromPlan"
import { composeFormula, evaluateNamingFormula, type FormulaRefs } from "./formula"
import { PICKLISTS, TEMPLATES } from "./templates"
import type { NamingTemplate } from "./types"

export { INVALID_NAME_CELL, NEEDS_INPUT_CELL, emptyRequiredFreeKeysOnly }

/** Stable Input-sheet global addresses (Prompt 2 refs depend on these). */
export const INPUT_GLOBAL_CELLS = {
  brand: { row: 1, col: 2 },
  campaign: { row: 2, col: 2 },
  mba: { row: 3, col: 2 },
  month_start: { row: 4, col: 2 },
} as const

export const INPUT_TABLE_HEADER_ROW = 6
export const INPUT_TABLE_DATA_START_ROW = 7

/** Full Prompt 1 column set — order is law for formula column refs. */
export const INPUT_COLUMNS = [
  "line_item_id",
  "channelKey",
  "tab_label",
  "family",
  "publisher",
  "media_type",
  "buy_type",
  "targeting_raw",
  "targeting_token",
  "geo_raw",
  "geo_token",
  "creative_name",
  "size",
] as const

export type InputColumn = (typeof INPUT_COLUMNS)[number]

const INPUT_SHEET_NAME = "Input sheet"

const GLOBAL_RULES = [
  "Per-channel tabs use the rev-2 family map (digital→cm360, prog→dv360, search, social→meta).",
  "YouTube / Native tabs are overlays — rows are excluded from their source channel tabs.",
  "Composed name (formula) cells are Excel formulas; Composed name (value) mirrors AssembledView composeName.",
  "← add <field> in AV on a value cell means a required free field is blank (buyer input) — not INVALID. Fill the field in AssembledView (or type into the element column) and the formula completes without a trailing -.",
  "INVALID: fix in AV means a hard validation failure (separator in a value, bad month_start, missing required plan field, etc.).",
  "line_item_id is ALWAYS the last element at each platform's pacing-grain level.",
  "Element values use _ internally; - is the separator; slug charset [a-z0-9_+x].",
  "Rows without line_item_id cannot sync — see Skipped rows on the Input sheet.",
]

export type NamingWorkbookInput = {
  globals: PlanGlobals
  lineItems: Record<string, unknown[]>
  version: string | number
  publishers?: Publisher[]
  containerBestPractice?: MediaContainerBestPractice[]
  tokenOverrides?: TokenOverrides
}

function colLetter(col1Based: number): string {
  let n = col1Based
  let s = ""
  while (n > 0) {
    const rem = (n - 1) % 26
    s = String.fromCharCode(65 + rem) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

function inputAbsRef(col1Based: number, row: number): string {
  return `'${INPUT_SHEET_NAME}'!$${colLetter(col1Based)}$${row}`
}

function localAbsRef(col1Based: number, row: number): string {
  return `$${colLetter(col1Based)}$${row}`
}

function inputColIndex(key: InputColumn): number {
  const idx = INPUT_COLUMNS.indexOf(key)
  if (idx < 0) throw new Error(`Unknown input column: ${key}`)
  return idx + 1
}

function defaultPicklistValue(picklistKey: string | undefined): string {
  if (!picklistKey) return ""
  const list = PICKLISTS[picklistKey]
  return list?.[0] ?? ""
}

function levelHeading(level: string): string {
  const spaced = level.replace(/_/g, " ")
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

function stripLeadingEquals(formula: string): string {
  return formula.startsWith("=") ? formula.slice(1) : formula
}

function templateHasIabSize(template: NamingTemplate): boolean {
  return template.elements.some(
    (el) => el.key === "size" && el.picklist === "iab_sizes",
  )
}

export function namingWorkbookFilename(
  mba: string,
  version: string | number,
  date: Date = new Date(),
): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, "0")
  const d = String(date.getUTCDate()).padStart(2, "0")
  const stem = String(mba || "mba")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "")
  const ver = String(version ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "")
  return `naming-${stem || "mba"}-v${ver || "0"}-${y}${m}${d}.xlsx`
}

function gatherInputRows(
  tabs: ChannelTab[],
  lineItems: Record<string, unknown[]>,
  tokenOverrides?: TokenOverrides,
): ChannelDetailRow[] {
  const rows: ChannelDetailRow[] = []
  const seen = new Set<string>()
  for (const tab of tabs) {
    const { rows: tabRows } = channelRows(tab, lineItems, tokenOverrides)
    for (const row of tabRows) {
      if (seen.has(row.line_item_id)) continue
      seen.add(row.line_item_id)
      rows.push(row)
    }
  }
  return rows
}

function writeInputSheet(
  workbook: ExcelJS.Workbook,
  globals: PlanGlobals,
  inputRows: ChannelDetailRow[],
  lineItems: Record<string, unknown[]>,
): Map<string, number> {
  const sheet = workbook.addWorksheet(INPUT_SHEET_NAME)
  for (let c = 1; c <= INPUT_COLUMNS.length; c++) {
    sheet.getColumn(c).width = c === 1 ? 16 : 18
  }

  const globalEntries: Array<[keyof typeof INPUT_GLOBAL_CELLS, string]> = [
    ["brand", globals.brand],
    ["campaign", globals.campaign],
    ["mba", globals.mba],
    ["month_start", globals.month_start],
  ]
  for (const [key, value] of globalEntries) {
    const { row, col } = INPUT_GLOBAL_CELLS[key]
    sheet.getCell(row, 1).value = key
    sheet.getCell(row, 1).font = { bold: true }
    sheet.getCell(row, col).value = value
  }

  INPUT_COLUMNS.forEach((h, i) => {
    const cell = sheet.getCell(INPUT_TABLE_HEADER_ROW, i + 1)
    cell.value = h
    cell.font = { bold: true }
  })

  sheet.views = [
    {
      state: "frozen",
      ySplit: INPUT_TABLE_HEADER_ROW,
      activeCell: "A7",
    },
  ]

  const rowByLineItemId = new Map<string, number>()
  inputRows.forEach((row, idx) => {
    const r = INPUT_TABLE_DATA_START_ROW + idx
    rowByLineItemId.set(row.line_item_id, r)
    sheet.getCell(r, inputColIndex("line_item_id")).value = row.line_item_id
    sheet.getCell(r, inputColIndex("channelKey")).value = row.channelKey
    sheet.getCell(r, inputColIndex("tab_label")).value = row.tab_label
    sheet.getCell(r, inputColIndex("family")).value = row.family
    sheet.getCell(r, inputColIndex("publisher")).value = row.publisher
    sheet.getCell(r, inputColIndex("media_type")).value = row.media_type
    sheet.getCell(r, inputColIndex("buy_type")).value = row.buy_type
    sheet.getCell(r, inputColIndex("targeting_raw")).value = row.targeting_raw
    sheet.getCell(r, inputColIndex("targeting_token")).value = row.targeting_token
    sheet.getCell(r, inputColIndex("geo_raw")).value = row.geo_raw
    sheet.getCell(r, inputColIndex("geo_token")).value = row.geo_token
    sheet.getCell(r, inputColIndex("creative_name")).value = row.creative_name
    sheet.getCell(r, inputColIndex("size")).value = row.size ?? ""
  })

  const skipped = collectSkippedLineItems(lineItems)
  let noteRow =
    INPUT_TABLE_DATA_START_ROW + Math.max(inputRows.length, 1) + 2
  sheet.getCell(noteRow, 1).value = "Skipped rows (cannot sync)"
  sheet.getCell(noteRow, 1).font = { bold: true }
  noteRow++
  sheet.getCell(noteRow, 1).value =
    "reason: missing_line_item_id — line items with no id are excluded from channel tabs"
  noteRow++

  const total = skipped.reduce((sum, g) => sum + g.count, 0)
  sheet.getCell(noteRow, 1).value = `Total skipped count: ${total}`
  noteRow++

  if (skipped.length === 0) {
    sheet.getCell(noteRow, 1).value = "(none)"
  } else {
    sheet.getCell(noteRow, 1).value = "channel"
    sheet.getCell(noteRow, 2).value = "publisher"
    sheet.getCell(noteRow, 3).value = "count"
    sheet.getCell(noteRow, 1).font = { bold: true }
    sheet.getCell(noteRow, 2).font = { bold: true }
    sheet.getCell(noteRow, 3).font = { bold: true }
    noteRow++
    for (const g of skipped) {
      sheet.getCell(noteRow, 1).value = g.channelKey
      sheet.getCell(noteRow, 2).value = g.publisher
      sheet.getCell(noteRow, 3).value = g.count
      noteRow++
    }
  }

  return rowByLineItemId
}

function seedElementValues(
  template: NamingTemplate,
  globals: PlanGlobals,
  line: ChannelDetailRow | null,
  sizeOverride?: string,
  composites?: { campaign_name?: string; io_name?: string },
): Record<string, string> {
  const values: Record<string, string> = {}
  for (const el of template.elements) {
    if (el.source === "literal") {
      values[el.key] = el.literal ?? ""
      continue
    }
    if (el.source === "picklist") {
      if (el.key === "size" && sizeOverride !== undefined) {
        values[el.key] = sizeOverride
      } else if (el.key === "geo" && line?.geo_token) {
        values[el.key] = line.geo_token
      } else {
        values[el.key] = defaultPicklistValue(el.picklist)
      }
      continue
    }
    if (el.source === "free") {
      values[el.key] = ""
      continue
    }
    switch (el.key) {
      case "brand":
        values[el.key] = globals.brand
        break
      case "client":
        values[el.key] = globals.client || globals.brand
        break
      case "campaign":
        values[el.key] = globals.campaign
        break
      case "mba":
        values[el.key] = globals.mba
        break
      case "month_start":
        values[el.key] = globals.month_start
        break
      case "publisher":
        values[el.key] = line?.publisher ?? ""
        break
      case "media_type":
        values[el.key] = line?.media_type ?? ""
        break
      case "line_item_id":
        values[el.key] = line?.line_item_id ?? ""
        break
      case "targeting":
        values[el.key] = line?.targeting_token ?? ""
        break
      case "creative_name":
        values[el.key] = line?.creative_name ?? ""
        break
      case "buy_type":
        values[el.key] = line?.buy_type ?? ""
        break
      case "campaign_name":
        values[el.key] = composites?.campaign_name ?? ""
        break
      case "io_name":
        values[el.key] = composites?.io_name ?? ""
        break
      default:
        values[el.key] = ""
    }
  }
  return values
}

function buildRefsForRow(opts: {
  template: NamingTemplate
  globals: PlanGlobals
  line: ChannelDetailRow | null
  inputRow: number | null
  elementCols: Map<string, number>
  excelRow: number
  compositeRefs?: { campaign_name?: string; io_name?: string }
}): FormulaRefs {
  const refs: FormulaRefs = {}
  const { template, line, inputRow, elementCols, excelRow, compositeRefs } = opts

  for (const el of template.elements) {
    if (el.source === "literal") continue

    if (el.key === "brand") {
      refs.brand = inputAbsRef(INPUT_GLOBAL_CELLS.brand.col, INPUT_GLOBAL_CELLS.brand.row)
      continue
    }
    if (el.key === "campaign") {
      refs.campaign = inputAbsRef(
        INPUT_GLOBAL_CELLS.campaign.col,
        INPUT_GLOBAL_CELLS.campaign.row,
      )
      continue
    }
    if (el.key === "mba") {
      refs.mba = inputAbsRef(INPUT_GLOBAL_CELLS.mba.col, INPUT_GLOBAL_CELLS.mba.row)
      continue
    }
    if (el.key === "month_start") {
      refs.month_start = inputAbsRef(
        INPUT_GLOBAL_CELLS.month_start.col,
        INPUT_GLOBAL_CELLS.month_start.row,
      )
      continue
    }
    if (el.key === "client") {
      // B1..B4 only — client shares brand cell (same slug in plan globals)
      refs.client = inputAbsRef(INPUT_GLOBAL_CELLS.brand.col, INPUT_GLOBAL_CELLS.brand.row)
      continue
    }
    if (el.key === "campaign_name" && compositeRefs?.campaign_name) {
      refs.campaign_name = compositeRefs.campaign_name
      continue
    }
    if (el.key === "io_name" && compositeRefs?.io_name) {
      refs.io_name = compositeRefs.io_name
      continue
    }

    // Picklists are seeded on the channel tab — prefer local cells so Excel
    // recalc matches composeName defaults when Input geo_token/etc. is empty.
    if (el.source === "picklist") {
      const localCol = elementCols.get(el.key)
      if (localCol != null) {
        refs[el.key] = localAbsRef(localCol, excelRow)
        continue
      }
    }

    // Per-row Input columns
    if (inputRow != null && line) {
      if (el.key === "publisher") {
        refs.publisher = inputAbsRef(inputColIndex("publisher"), inputRow)
        continue
      }
      if (el.key === "media_type") {
        refs.media_type = inputAbsRef(inputColIndex("media_type"), inputRow)
        continue
      }
      if (el.key === "line_item_id") {
        refs.line_item_id = inputAbsRef(inputColIndex("line_item_id"), inputRow)
        continue
      }
      if (el.key === "targeting") {
        refs.targeting = inputAbsRef(inputColIndex("targeting_token"), inputRow)
        continue
      }
      if (el.key === "geo") {
        refs.geo = inputAbsRef(inputColIndex("geo_token"), inputRow)
        continue
      }
      if (el.key === "creative_name") {
        refs.creative_name = inputAbsRef(inputColIndex("creative_name"), inputRow)
        continue
      }
      if (el.key === "buy_type") {
        refs.buy_type = inputAbsRef(inputColIndex("buy_type"), inputRow)
        continue
      }
    }

    // Local cells on the channel tab (size, free, picklists, composites written locally)
    const localCol = elementCols.get(el.key)
    if (localCol != null) {
      refs[el.key] = localAbsRef(localCol, excelRow)
    } else if (el.optional) {
      // omit — composeFormula skips optional without ref
    } else {
      // Required without a mapping — point at local col if we created one
      const fallbackCol = elementCols.get(el.key)
      if (fallbackCol != null) refs[el.key] = localAbsRef(fallbackCol, excelRow)
    }
  }

  return refs
}

function writeChannelSheet(
  workbook: ExcelJS.Workbook,
  tab: ChannelTab,
  globals: PlanGlobals,
  lineItems: Record<string, unknown[]>,
  rowByLineItemId: Map<string, number>,
  publishers: Publisher[],
  containerBestPractice: MediaContainerBestPractice[],
  tokenOverrides?: TokenOverrides,
): void {
  const sheet = workbook.addWorksheet(tab.label)
  const templates = templatesForPlatform(tab.family)
  const { rows: detailRows } = channelRows(tab, lineItems, tokenOverrides)

  let rowIndex = 1
  const headerColSpan = 12

  if (tab.containerKey) {
    const containerNote =
      containerBestPractice.find(
        (c) => c.media_container === tab.containerKey && c.is_active,
      )?.best_practice ?? null
    rowIndex = renderBestPracticeBlock(
      sheet,
      rowIndex,
      `Best Practice - ${tab.label}`,
      containerNote,
      headerColSpan,
    )
  }

  for (const publisher of chosenPublishersFor(detailRows, publishers)) {
    rowIndex = renderBestPracticeBlock(
      sheet,
      rowIndex,
      `Best Practice - ${publisher.publisher_name}`,
      publisher.best_practice ?? null,
      headerColSpan,
    )
  }

  let campaignNameValue = ""
  let campaignNameRef = ""
  let ioNameValue = ""
  let ioNameRef = ""

  for (const template of templates) {
    sheet.getCell(rowIndex, 1).value = levelHeading(template.level)
    sheet.getCell(rowIndex, 1).font = { bold: true, size: 12 }
    rowIndex++

    const keys = template.elements.map((el) => el.key)
    const headers = [
      ...keys,
      "Composed name (formula)",
      "Composed name (value)",
    ]
    const elementCols = new Map<string, number>()
    keys.forEach((key, i) => elementCols.set(key, i + 1))
    const formulaCol = keys.length + 1
    const valueCol = keys.length + 2

    headers.forEach((h, i) => {
      const cell = sheet.getCell(rowIndex, i + 1)
      cell.value = h
      cell.font = { bold: true }
    })
    rowIndex++

    const needsLines = levelNeedsLineItemSeed(template)
    const baseLines: Array<ChannelDetailRow | null> = needsLines
      ? detailRows.length > 0
        ? detailRows
        : []
      : [null]

    const expandSizes = templateHasIabSize(template)
    const sizes = expandSizes ? [...PICKLISTS.iab_sizes] : [undefined]

    for (const line of baseLines) {
      for (const size of sizes) {
        const composites = {
          campaign_name: campaignNameValue,
          io_name: ioNameValue,
        }
        const values = seedElementValues(
          template,
          globals,
          line,
          size,
          composites,
        )
        const attempt = tryComposeName(template, values)
        const needsInputKeys = !attempt.ok
          ? emptyRequiredFreeKeysOnly(template, values)
          : null
        const composed = attempt.ok
          ? attempt.name
          : needsInputKeys
            ? NEEDS_INPUT_CELL(needsInputKeys)
            : INVALID_NAME_CELL

        const excelRow = rowIndex
        const inputRow =
          line != null ? (rowByLineItemId.get(line.line_item_id) ?? null) : null

        // Write element display values
        keys.forEach((key, i) => {
          const el = template.elements[i]
          const raw =
            el?.source === "literal"
              ? (el.literal ?? values[key] ?? "")
              : (values[key] ?? "")
          sheet.getCell(excelRow, i + 1).value = raw
        })

        const refs = buildRefsForRow({
          template,
          globals,
          line,
          inputRow,
          elementCols,
          excelRow,
          compositeRefs: {
            campaign_name: campaignNameRef || undefined,
            io_name: ioNameRef || undefined,
          },
        })

        // Ensure local refs exist for free/picklist/size written on this row
        for (const el of template.elements) {
          if (el.source === "literal") continue
          if (refs[el.key]) continue
          const col = elementCols.get(el.key)
          if (col != null) {
            if (el.optional || el.source === "free" || el.source === "picklist") {
              refs[el.key] = localAbsRef(col, excelRow)
            }
          }
        }

        let formulaStr = ""
        try {
          formulaStr = composeFormula(template, refs)
        } catch {
          formulaStr = ""
        }

        const writeLiveFormula = Boolean(formulaStr) && (attempt.ok || Boolean(needsInputKeys))
        if (writeLiveFormula) {
          let formulaResult = composed
          if (needsInputKeys && formulaStr) {
            // Cached Excel result = evaluated name without blank required frees
            const evalCells: Record<string, string> = {}
            for (const el of template.elements) {
              if (el.source === "literal") continue
              const ref = refs[el.key]
              if (!ref) continue
              evalCells[ref] = values[el.key] ?? ""
            }
            try {
              formulaResult = evaluateNamingFormula(formulaStr, evalCells)
            } catch {
              formulaResult = composed
            }
          }
          sheet.getCell(excelRow, formulaCol).value = {
            formula: stripLeadingEquals(formulaStr),
            result: formulaResult,
          }
        } else {
          sheet.getCell(excelRow, formulaCol).value = INVALID_NAME_CELL
        }
        sheet.getCell(excelRow, valueCol).value = composed

        if (template.level === "campaign" && attempt.ok) {
          campaignNameValue = composed
          campaignNameRef = localAbsRef(valueCol, excelRow)
        }
        if (template.level === "insertion_order" && attempt.ok) {
          ioNameValue = composed
          ioNameRef = localAbsRef(valueCol, excelRow)
        }

        rowIndex++
      }
    }

    rowIndex++ // spacer between levels
  }

  for (let c = 1; c <= 14; c++) {
    if (!sheet.getColumn(c).width) sheet.getColumn(c).width = 18
  }
}

function writeRulesSheet(workbook: ExcelJS.Workbook): void {
  const sheet = workbook.addWorksheet("Rules")
  sheet.getColumn(1).width = 14
  sheet.getColumn(2).width = 18
  sheet.getColumn(3).width = 72
  sheet.getColumn(4).width = 14

  const headers = ["platform", "level", "element_order", "pacing_grain"]
  headers.forEach((h, i) => {
    const cell = sheet.getCell(1, i + 1)
    cell.value = h
    cell.font = { bold: true }
  })

  let rowIndex = 2
  for (const template of TEMPLATES) {
    sheet.getCell(rowIndex, 1).value = template.platform
    sheet.getCell(rowIndex, 2).value = template.level
    sheet.getCell(rowIndex, 3).value = template.elements.map((el) => el.key).join(" - ")
    sheet.getCell(rowIndex, 4).value = template.isPacingGrain ? "yes" : "no"
    rowIndex++
  }

  rowIndex += 1
  sheet.getCell(rowIndex, 1).value = "Global rules"
  sheet.getCell(rowIndex, 1).font = { bold: true }
  rowIndex++
  for (const line of GLOBAL_RULES) {
    sheet.getCell(rowIndex, 1).value = line
    sheet.mergeCells(rowIndex, 1, rowIndex, 4)
    rowIndex++
  }
}

/**
 * Build a per-channel naming workbook: Input → channel tabs → Rules.
 * Formula cells use exceljs `{ formula, result }`; value cells mirror composeName.
 */
export async function buildNamingWorkbook(
  input: NamingWorkbookInput,
): Promise<ExcelJS.Workbook> {
  const ExcelJSMod = (await import("exceljs")).default
  const workbook = new ExcelJSMod.Workbook()
  workbook.creator = "AssembledView"
  workbook.created = new Date()

  const tabs = deriveChannelTabs(input.lineItems)
  const inputRows = gatherInputRows(
    tabs,
    input.lineItems,
    input.tokenOverrides,
  )
  const rowByLineItemId = writeInputSheet(
    workbook,
    input.globals,
    inputRows,
    input.lineItems,
  )

  for (const tab of tabs) {
    writeChannelSheet(
      workbook,
      tab,
      input.globals,
      input.lineItems,
      rowByLineItemId,
      input.publishers ?? [],
      input.containerBestPractice ?? [],
      input.tokenOverrides,
    )
  }

  writeRulesSheet(workbook)
  return workbook
}
