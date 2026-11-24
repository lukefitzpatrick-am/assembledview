/**
 * S15 A: every export sheet carries a visibility. A workbook leaving the app
 * for a supplier or a client goes through `filterWorkbookBufferForAudience`
 * (switch `export_sheet_visibility`). Staff downloads are `internal` and keep
 * every sheet. A sheet missing from the map is internal only (fails closed).
 */
import ExcelJS from "exceljs"

import { AA_INSERTIONS_SHEET, AA_SUPPLIER_SHEET } from "@/lib/docs/aaWorkbookSheets"

export type ExportAudience = "internal" | "supplier" | "client"

const SHEET_AUDIENCES: Readonly<Record<string, readonly ExportAudience[]>> = {
  "Media Plan": ["internal", "supplier", "client"],
  "Campaign KPIs": ["internal", "client"],
  [AA_SUPPLIER_SHEET]: ["internal", "supplier"],
  [AA_INSERTIONS_SHEET]: ["internal", "supplier", "client"],
  // AA pack summary workbook.
  Summary: ["internal", "supplier"],
}

function sheetVisibleTo(sheetName: string, audience: ExportAudience): boolean {
  if (audience === "internal") return true
  return SHEET_AUDIENCES[sheetName]?.includes(audience) ?? false
}

/** Sheet name of `'Sheet name'!$A$1` or `Sheet!A1`. */
function rangeSheet(range: string): string {
  const bang = range.lastIndexOf("!")
  const raw = bang < 0 ? "" : range.slice(0, bang)
  return raw.startsWith("'") ? raw.slice(1, -1).replace(/''/g, "'") : raw
}

/** Only admin is internal. Any other caller that passed the tenant check is a client. */
export function exportAudienceFor(access: { isAdmin?: boolean }): ExportAudience {
  return access.isAdmin === true ? "internal" : "client"
}

/** The workbook with only the sheets `audience` may see. Throws when none is left. */
export async function filterWorkbookBufferForAudience(
  buffer: Buffer,
  audience: ExportAudience,
): Promise<Buffer> {
  if (audience === "internal") return buffer
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer)
  const hidden = workbook.worksheets.filter((ws) => !sheetVisibleTo(ws.name, audience))
  if (hidden.length === 0) return buffer
  if (hidden.length === workbook.worksheets.length) {
    throw new Error(`No sheet in this workbook is visible to the ${audience} audience`)
  }
  const hiddenNames = new Set(hidden.map((ws) => ws.name))
  for (const ws of hidden) workbook.removeWorksheet(ws.id)
  // A defined name that points at a removed sheet would still name it.
  workbook.definedNames.model = workbook.definedNames.model.filter(
    (entry) => !entry.ranges.some((range) => hiddenNames.has(rangeSheet(range))),
  )
  return Buffer.from((await workbook.xlsx.writeBuffer()) as ArrayBuffer)
}
