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
