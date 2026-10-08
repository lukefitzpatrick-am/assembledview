import type { jsPDF } from "jspdf"

import { BRAND, hexToRgb } from "@/lib/brand"

/** RGB tuples for jsPDF setTextColor / setDrawColor / setFillColor. */
export const PDF_COLOURS = {
  ink: hexToRgb(BRAND.colour.ink),
  body: hexToRgb(BRAND.colour.body),
  muted: hexToRgb(BRAND.colour.muted),
  line: hexToRgb(BRAND.colour.line),
  sand: hexToRgb(BRAND.colour.sand),
  forest: hexToRgb(BRAND.colour.forest),
  lime: hexToRgb(BRAND.colour.lime),
} as const

/** Logo artboard is 1000×148. */
export const PDF_LOGO_HEIGHT_RATIO = 148 / 1000

export function pdfLogoHeight(width: number): number {
  return width * PDF_LOGO_HEIGHT_RATIO
}

/**
 * Registers Plus Jakarta Sans (normal, bold, extrabold) and sets it as the
 * default. The font module is dynamic so client bundles load it only when a
 * PDF is generated.
 */
/**
 * Max width for a left header cell that shares its row with right-aligned text.
 * Half the content width, minus 4mm, so Jakarta cannot run into the right column.
 */
export function pairedHeaderMaxWidthMm(contentWidthMm: number): number {
  return contentWidthMm / 2 - 4
}

/**
 * Draws a left-column header line. A string that still fits is drawn with
 * `doc.text(text)` so a single line matches the previous output. When the
 * line wraps, returns the extra height `(lineCount - 1) * lineHeightMm`
 * for the caller to add under this row.
 */
export function drawWrappedLeftHeader(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  contentWidthMm: number,
  lineHeightMm: number,
): number {
  const lines = doc.splitTextToSize(text, pairedHeaderMaxWidthMm(contentWidthMm))
  if (lines.length <= 1) {
    doc.text(text, x, y)
    return 0
  }
  for (let i = 0; i < lines.length; i++) {
    doc.text(lines[i] ?? "", x, y + i * lineHeightMm)
  }
  return (lines.length - 1) * lineHeightMm
}

export async function applyBrandFonts(doc: jsPDF): Promise<void> {
  const fonts = await import("./fonts/plusJakartaSans")
  doc.addFileToVFS("PlusJakartaSans-Regular.ttf", fonts.regular)
  doc.addFont("PlusJakartaSans-Regular.ttf", "PlusJakartaSans", "normal")
  doc.addFileToVFS("PlusJakartaSans-Bold.ttf", fonts.bold)
  doc.addFont("PlusJakartaSans-Bold.ttf", "PlusJakartaSans", "bold")
  doc.addFileToVFS("PlusJakartaSans-ExtraBold.ttf", fonts.extrabold)
  doc.addFont("PlusJakartaSans-ExtraBold.ttf", "PlusJakartaSans", "extrabold")
  doc.setFont("PlusJakartaSans", "normal")
  const [r, g, b] = PDF_COLOURS.ink
  doc.setTextColor(r, g, b)
}
