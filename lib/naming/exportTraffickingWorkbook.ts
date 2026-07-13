import type ExcelJS from "exceljs"

import { composeName } from "./compose"
import type { BaseLineRow, NamingPlatform, PlanGlobals } from "./fromPlan"
import { TEMPLATES } from "./templates"
import type { NamingTemplate } from "./types"
import { validateValue } from "./validate"

export const INVALID_NAME_CELL = "INVALID: fix in AV"

/** Excel sheet titles for active platform tabs (master workbook labels). */
export const PLATFORM_SHEET_NAMES: Record<NamingPlatform, string> = {
  cm360: "Campaign Manager",
  dv360: "DV360",
  youtube: "YouTube",
  meta: "Social",
  search: "Search",
  native: "Native",
}

export type TraffickingExportRow = {
  /** Element values ready for compose (composites + literals already merged). */
  values: Record<string, string>
  /** Excluded base rows are treated as invalid for export. */
  excluded?: boolean
}

export type TraffickingExportLevel = {
  template: NamingTemplate
  rows: TraffickingExportRow[]
}

export type TraffickingExportPlatform = {
  platform: NamingPlatform
  levels: TraffickingExportLevel[]
}

export type TraffickingExportInput = {
  globals: PlanGlobals
  inputRows: BaseLineRow[]
  /** Active platform tabs only, in UI order. */
  platforms: TraffickingExportPlatform[]
}

export type ComposeAttempt =
  | { ok: true; name: string }
  | { ok: false; error: string }

/** Validate then compose via the naming engine — never invents a broken name. */
export function tryComposeName(
  template: NamingTemplate,
  values: Record<string, string>,
): ComposeAttempt {
  for (const el of template.elements) {
    if (el.source === "literal") continue
    const raw = values[el.key] ?? ""
    if (!raw.trim()) {
      if (el.optional) continue
      return { ok: false, error: `Missing ${el.key}` }
    }
    const check = validateValue(el, raw)
    if (!check.ok) return { ok: false, error: check.message ?? `Invalid ${el.key}` }
  }
  try {
    return { ok: true, name: composeName(template, values) }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Compose failed",
    }
  }
}

export function traffickingWorkbookFilename(mba: string, date: Date = new Date()): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, "0")
  const d = String(date.getUTCDate()).padStart(2, "0")
  const stem = String(mba || "mba")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "")
  return `naming-${stem || "mba"}-${y}${m}${d}.xlsx`
}

export function formatLevelCopy(names: string[]): string {
  return names.join("\n")
}

/** Human level heading for copy blocks (`ad_set` → `Ad set`). */
export function levelHeading(level: string): string {
  const spaced = level.replace(/_/g, " ")
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

export function formatPlatformBlock(
  levels: { level: string; names: string[] }[],
): string {
  return levels
    .map((block) => `## ${levelHeading(block.level)}\n${formatLevelCopy(block.names)}`)
    .join("\n\n")
}

const GLOBAL_RULES = [
  "DV360 templates cover ALL programmatic channels.",
  "CM360 (Campaign Manager) covers other digital channels.",
  "line_item_id is ALWAYS the last element at each platform's pacing-grain level.",
  "Element values use _ internally; - is the separator; slug charset [a-z0-9_+x].",
  "Names in this workbook are values only — AssembledView is the formula engine (no Excel formulas).",
]

function writeInputSheet(
  workbook: ExcelJS.Workbook,
  globals: PlanGlobals,
  inputRows: BaseLineRow[],
): void {
  const sheet = workbook.addWorksheet("Input sheet")
  sheet.getColumn(1).width = 16
  sheet.getColumn(2).width = 28
  sheet.getColumn(3).width = 18
  sheet.getColumn(4).width = 28

  const headerBlock: Array<[string, string]> = [
    ["brand", globals.brand],
    ["campaign", globals.campaign],
    ["mba", globals.mba],
    ["month_start", globals.month_start],
  ]
  headerBlock.forEach(([key, value], idx) => {
    const row = idx + 1
    sheet.getCell(row, 1).value = key
    sheet.getCell(row, 1).font = { bold: true }
    sheet.getCell(row, 2).value = value
  })

  const tableStart = headerBlock.length + 2
  const headers = ["publisher", "media_type", "line_item_id", "targeting"]
  headers.forEach((h, i) => {
    const cell = sheet.getCell(tableStart, i + 1)
    cell.value = h
    cell.font = { bold: true }
  })

  inputRows.forEach((row, idx) => {
    const r = tableStart + 1 + idx
    sheet.getCell(r, 1).value = row.publisher
    sheet.getCell(r, 2).value = row.media_type
    sheet.getCell(r, 3).value = row.line_item_id
    sheet.getCell(r, 4).value = row.targeting
  })
}

function writePlatformSheet(
  workbook: ExcelJS.Workbook,
  platform: TraffickingExportPlatform,
): void {
  const sheetName = PLATFORM_SHEET_NAMES[platform.platform]
  const sheet = workbook.addWorksheet(sheetName)
  let rowIndex = 1

  for (const level of platform.levels) {
    const { template, rows } = level
    sheet.getCell(rowIndex, 1).value = levelHeading(template.level)
    sheet.getCell(rowIndex, 1).font = { bold: true, size: 12 }
    rowIndex++

    const keys = template.elements.map((el) => el.key)
    const headers = [...keys, "Composed name"]
    headers.forEach((h, i) => {
      const cell = sheet.getCell(rowIndex, i + 1)
      cell.value = h
      cell.font = { bold: true }
    })
    rowIndex++

    for (const row of rows) {
      const attempt =
        row.excluded === true
          ? ({ ok: false, error: "Excluded" } as const)
          : tryComposeName(template, row.values)
      const composed = attempt.ok ? attempt.name : INVALID_NAME_CELL

      keys.forEach((key, i) => {
        const el = template.elements[i]
        const raw =
          el?.source === "literal"
            ? (el.literal ?? row.values[key] ?? "")
            : (row.values[key] ?? "")
        sheet.getCell(rowIndex, i + 1).value = raw
      })
      sheet.getCell(rowIndex, keys.length + 1).value = composed
      rowIndex++
    }

    rowIndex++ // blank spacer between levels
  }

  for (let c = 1; c <= 12; c++) {
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
 * Build a master-shaped trafficking workbook.
 * Composed names come from `composeName` (values only — no Excel formulas).
 */
export async function buildTraffickingWorkbook(
  input: TraffickingExportInput,
): Promise<ExcelJS.Workbook> {
  const ExcelJSMod = (await import("exceljs")).default
  const workbook = new ExcelJSMod.Workbook()
  workbook.creator = "AssembledView"
  workbook.created = new Date()

  writeInputSheet(workbook, input.globals, input.inputRows)
  for (const platform of input.platforms) {
    writePlatformSheet(workbook, platform)
  }
  writeRulesSheet(workbook)

  return workbook
}

export async function downloadTraffickingWorkbook(
  input: TraffickingExportInput,
  filename?: string,
): Promise<string> {
  const { saveAs } = await import("file-saver")
  const workbook = await buildTraffickingWorkbook(input)
  const name = filename ?? traffickingWorkbookFilename(input.globals.mba)
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })
  saveAs(blob, name)
  return name
}
