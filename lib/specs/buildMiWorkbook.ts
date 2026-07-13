import type ExcelJS from "exceljs"

import { loadTemplateStructure } from "./library.js"
import type {
  MiAnswer,
  MiOpenQuestion,
  MiResolveResult,
  MiResolvedSpec,
} from "./resolve.js"

const TAB_ORDER = [
  "Search", "Social", "Programmatic", "Direct Digital", "YouTube", "BVOD",
  "Audio", "OOH", "Print", "Cinema", "Television",
]

const NEEDS_SPEC = "NEEDS_SPEC"
const THIN_BORDER = {
  top: { style: "thin" as const, color: { argb: "FFB7B7B7" } },
  left: { style: "thin" as const, color: { argb: "FFB7B7B7" } },
  bottom: { style: "thin" as const, color: { argb: "FFB7B7B7" } },
  right: { style: "thin" as const, color: { argb: "FFB7B7B7" } },
}

export type MiWorkbookCampaign = {
  name: string
  client: string
  prepared_by?: string
  prepared_date?: string
  overall_supply_deadline?: string
  notes?: string
}

export type MiWorkbookInput = {
  campaign: MiWorkbookCampaign
  line_items: MiResolvedSpec[]
  answers?: MiAnswer[]
  open_questions?: MiOpenQuestion[]
}

function slugPart(value: string, fallback: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return slug || fallback
}

export function miWorkbookFilename(
  client: string,
  campaign: string,
  date: Date = new Date(),
): string {
  const yyyy = date.getUTCFullYear()
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0")
  const dd = String(date.getUTCDate()).padStart(2, "0")
  return `MI_${slugPart(client, "client")}_${slugPart(campaign, "campaign")}_${yyyy}${mm}${dd}.xlsx`
}

function questionContainer(question: MiOpenQuestion): string {
  if (question.field === "specs_source" || question.field === "specs_paste") return "Direct Digital"
  if (question.field === "creative_type") return "Social"
  if (question.field === "dimensions") return "Direct Digital"
  return "Direct Digital"
}

function stubForQuestion(question: MiOpenQuestion): MiResolvedSpec {
  const container = questionContainer(question)
  return {
    line_item_id: question.rowRef.line_item_id,
    displayName: question.rowRef.displayName,
    container_category: container,
    publisher_slug: null,
    format_name: null,
    confidence: "needs_spec",
    fields_am: {
      "Line Item": question.rowRef.displayName,
      Publisher: NEEDS_SPEC,
      Format: NEEDS_SPEC,
    },
    fields_specs: {
      Source: NEEDS_SPEC,
      "Publisher-Specific Notes": NEEDS_SPEC,
    },
    fields_client: {},
  }
}

function valueForColumn(
  column: string,
  section: "AM" | "SPECS" | "CLIENT",
  row: MiResolvedSpec,
  campaign: MiWorkbookCampaign,
): string {
  const fields = section === "AM"
    ? row.fields_am
    : section === "SPECS"
      ? row.fields_specs
      : row.fields_client
  const exact = fields[column]
  if (exact !== undefined) return exact

  const aliases: Record<string, string[]> = {
    Campaign: [campaign.name],
    "Line Item": [row.fields_am["Line Item"] ?? row.displayName],
    Publisher: [row.fields_client.Publisher ?? row.fields_am.Publisher ?? ""],
    Format: [
      row.format_name && row.format_name !== "NEEDS_SPEC"
        ? row.format_name
        : (row.fields_am.Format
          || (row.confidence === "needs_spec" ? NEEDS_SPEC : "")),
    ],
    Variant: [row.variant ?? ""],
    "Live Date": [row.fields_am["Live Date"] ?? ""],
    "Ratio / Dimensions": [
      row.fields_specs["Ratio / Dimensions"] ?? row.fields_specs.Dimensions ?? row.fields_am.Dimensions ?? "",
    ],
    "Ad Dimensions": [row.fields_specs["Ad Dimensions"] ?? row.fields_specs.Dimensions ?? ""],
    "Pixel Dimensions": [row.fields_specs["Pixel Dimensions"] ?? row.fields_specs.Dimensions ?? ""],
    "Best Practice Notes": [
      row.fields_specs["Best Practice Notes"]
        ?? row.fields_specs["Publisher-Specific Notes"]
        ?? row.sourceNote
        ?? "",
    ],
    "Publisher / Broadcaster": [row.fields_client.Publisher ?? row.fields_am.Publisher ?? ""],
    "File Type": [row.fields_specs["File Type"] ?? ""],
    Source: [row.fields_specs.Source ?? ""],
  }
  return aliases[column]?.[0] ?? ""
}

function isAnswered(question: MiOpenQuestion, answers: MiAnswer[]): boolean {
  return answers.some(
    (answer) =>
      (answer.questionId === question.id || answer.questionId === question.appliesTo)
      && answer.answer.trim().length > 0,
  )
}

function hasQuestionForRow(question: MiOpenQuestion, row: MiResolvedSpec): boolean {
  return question.rowRef.line_item_id === row.line_item_id
}

function styleCell(cell: ExcelJS.Cell, fill: string, banded: boolean): void {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } }
  if (banded) {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: fill === "FFDCE6F1" ? "FFC5D9F1" : fill === "FFFFF2CC" ? "FFFFE699" : "FFC6E0B4" },
    }
  }
  cell.alignment = { wrapText: true, vertical: "top" }
  cell.border = THIN_BORDER
}

function writeCoverSheet(workbook: ExcelJS.Workbook, campaign: MiWorkbookCampaign): void {
  const sheet = workbook.addWorksheet("Cover")
  sheet.getColumn(1).width = 28
  sheet.getColumn(2).width = 72
  sheet.mergeCells("A1:B1")
  const title = sheet.getCell("A1")
  title.value = "MATERIAL INSTRUCTIONS"
  title.font = { bold: true, size: 16 }
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCE6F1" } }
  title.alignment = { horizontal: "center" }

  const values: Array<[string, string]> = [
    ["Campaign Name", campaign.name],
    ["Client", campaign.client],
    ["Prepared By", campaign.prepared_by ?? ""],
    ["Prepared Date", campaign.prepared_date ?? ""],
    ["Overall Supply Deadline", campaign.overall_supply_deadline ?? ""],
    ["Notes", campaign.notes ?? ""],
  ]
  values.forEach(([label, value], index) => {
    const row = index + 3
    sheet.getCell(row, 1).value = label
    sheet.getCell(row, 1).font = { bold: true }
    sheet.getCell(row, 2).value = value
    for (const col of [1, 2]) {
      const cell = sheet.getCell(row, col)
      cell.border = THIN_BORDER
      cell.alignment = { wrapText: true, vertical: "top" }
    }
  })

  sheet.getCell("A11").value = "Colour legend"
  sheet.getCell("A11").font = { bold: true }
  ;[["AM", "FFDCE6F1"], ["SPECS", "FFFFF2CC"], ["CLIENT", "FFE2EFDA"]].forEach(([label, fill], index) => {
    const cell = sheet.getCell(12 + index, 1)
    cell.value = label
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } }
    cell.border = THIN_BORDER
  })
}

function writeContainerSheet(
  workbook: ExcelJS.Workbook,
  container: string,
  rows: MiResolvedSpec[],
  input: MiWorkbookInput,
): number {
  const template = loadTemplateStructure().tabs[container]
  const sheet = workbook.addWorksheet(container)
  const sections: Array<["AM" | "SPECS" | "CLIENT", string, string[]]> = [
    ["AM", "FFDCE6F1", template.AM],
    ["SPECS", "FFFFF2CC", template.SPECS],
    ["CLIENT", "FFE2EFDA", template.CLIENT],
  ]
  const headers = sections.flatMap(([, , fields]) => fields)
  let column = 1
  for (const [section, fill, fields] of sections) {
    const start = column
    const end = column + fields.length - 1
    if (fields.length > 1) sheet.mergeCells(1, start, 1, end)
    const banner = sheet.getCell(1, start)
    banner.value = section
    banner.font = { bold: true }
    banner.alignment = { horizontal: "center", vertical: "middle" }
    banner.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } }
    for (const field of fields) {
      const cell = sheet.getCell(2, column)
      cell.value = field
      cell.font = { bold: true }
      styleCell(cell, fill, false)
      sheet.getColumn(column).width = Math.min(42, Math.max(16, field.length + 4))
      column += 1
    }
  }

  const unanswered = (input.open_questions ?? []).filter(
    (question) => !isAnswered(question, input.answers ?? []),
  )
  let gapCount = 0
  rows.forEach((row, index) => {
    const excelRow = index + 3
    const rowQuestions = unanswered.filter((question) => hasQuestionForRow(question, row))
    let col = 1
    for (const [section, fill, fields] of sections) {
      for (const field of fields) {
        let value = valueForColumn(field, section, row, input.campaign)
        if (section === "SPECS" && rowQuestions.length > 0 && !value) value = NEEDS_SPEC
        // Resolved needs_spec rows (skip / per booking / awaiting upload) still
        // materialise empty SPECS cells as gaps — same as unanswered stubs.
        if (section === "SPECS" && row.confidence === "needs_spec" && !value) {
          value = NEEDS_SPEC
        }
        const cell = sheet.getCell(excelRow, col)
        cell.value = value
        styleCell(cell, fill, index % 2 === 1)
        if (value === NEEDS_SPEC) gapCount += 1
        col += 1
      }
    }
    sheet.getRow(excelRow).height = 34
  })
  sheet.views = [{ state: "frozen", xSplit: 3, ySplit: 2 }]
  sheet.autoFilter = { from: { row: 2, column: 1 }, to: { row: Math.max(2, rows.length + 2), column: headers.length } }
  return gapCount
}

export async function buildMiWorkbook(input: MiWorkbookInput): Promise<{
  workbook: ExcelJS.Workbook
  gapCount: number
  sheetNames: string[]
}> {
  const ExcelJSMod = (await import("exceljs")).default
  const workbook = new ExcelJSMod.Workbook()
  workbook.creator = "AssembledView"
  workbook.created = new Date()
  writeCoverSheet(workbook, input.campaign)

  const unanswered = (input.open_questions ?? []).filter(
    (question) => !isAnswered(question, input.answers ?? []),
  )
  const existingIds = new Set(input.line_items.map((row) => row.line_item_id))
  const rows = [
    ...input.line_items,
    ...unanswered
      .filter((question) => !existingIds.has(question.rowRef.line_item_id))
      .map(stubForQuestion),
  ]
  let gapCount = 0
  for (const container of TAB_ORDER) {
    const tabRows = rows.filter((row) => row.container_category === container)
    if (tabRows.length > 0) gapCount += writeContainerSheet(workbook, container, tabRows, input)
  }
  return { workbook, gapCount, sheetNames: workbook.worksheets.map((sheet) => sheet.name) }
}

export function miPayloadFromResolve(
  campaign: MiWorkbookCampaign,
  result: MiResolveResult,
): MiWorkbookInput {
  const resolvedIds = new Set(result.resolved.map((row) => row.line_item_id))
  return {
    campaign,
    line_items: [
      ...result.resolved,
      ...result.open_questions
        .filter((question) => !resolvedIds.has(question.rowRef.line_item_id))
        .map(stubForQuestion),
    ],
    open_questions: result.open_questions,
  }
}
