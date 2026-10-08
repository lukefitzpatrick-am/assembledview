import type ExcelJS from "exceljs"

import { BRAND, hexToArgb, readableTextOn } from "@/lib/brand"

export const EXCEL_FONT = BRAND.font.excel

export const ARGB_INK = hexToArgb(BRAND.colour.ink)
export const ARGB_SAND = hexToArgb(BRAND.colour.sand)
export const ARGB_LINE = hexToArgb(BRAND.colour.line)
export const ARGB_SAND_TEXT = hexToArgb(readableTextOn(BRAND.colour.sand))
export const ARGB_INK_TEXT = hexToArgb(readableTextOn(BRAND.colour.ink))

export const SAND_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: ARGB_SAND },
}

export const INK_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: hexToArgb(BRAND.colour.ink) },
}

export const LINE_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: ARGB_LINE } },
  bottom: { style: "thin", color: { argb: ARGB_LINE } },
  left: { style: "thin", color: { argb: ARGB_LINE } },
  right: { style: "thin", color: { argb: ARGB_LINE } },
}

export function excelFont(partial: Partial<ExcelJS.Font> = {}): Partial<ExcelJS.Font> {
  return {
    color: { argb: ARGB_INK },
    ...partial,
    name: EXCEL_FONT,
  }
}

export function fillForHex(hex: string): ExcelJS.Fill {
  return {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: hexToArgb(hex) },
  }
}

/** Sand column header: Aptos, readable text, line border. */
export function paintSandHeader(cell: ExcelJS.Cell, partial: Partial<ExcelJS.Font> = {}): void {
  cell.font = excelFont({ bold: true, color: { argb: ARGB_SAND_TEXT }, ...partial })
  cell.fill = SAND_FILL
  cell.border = LINE_BORDER
}

/**
 * Aptos on every cell this sheet has written. Keeps bold/size already set.
 * Uncoloured text becomes ink. Does not change values, formats, widths, or formulas.
 */
export function stampAptos(sheet: ExcelJS.Worksheet): void {
  sheet.eachRow((row) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      const font = cell.font ?? {}
      cell.font = {
        ...font,
        name: EXCEL_FONT,
        color: font.color ?? { argb: ARGB_INK },
      }
    })
  })
}
