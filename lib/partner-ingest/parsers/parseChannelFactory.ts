import { COL } from "../columnNames"
import { extractPlanCode } from "../extractPlanCode"
import type { ParsedPartnerFile, PartnerDeliveryRow } from "../types"

import {
  cellDisplay,
  col,
  detectedHeaderFrom,
  findHeaderRow,
  headerIndex,
  parseNumber,
  parseReportDate,
  rawLinesFromMatrix,
  readPartnerFileMatrix,
} from "./shared"

export { CHANNEL_FACTORY_EXPECTED_HEADER } from "../columnNames"
export { rawLinesFromMatrix, readPartnerFileMatrix } from "./shared"

function isTotalsRow(cells: unknown[]): boolean {
  const first = cellDisplay(cells[0] ?? "").trim().toLowerCase()
  return first.startsWith("total")
}

export function parsePartnerFileMatrix(matrix: unknown[][]): ParsedPartnerFile {
  const rawLines = rawLinesFromMatrix(matrix)
  const headerRow = findHeaderRow(matrix, ["day", "impressions"])
  if (headerRow < 0) {
    return {
      headerRow: 0,
      preambleRowCount: 0,
      detectedHeader: "",
      rawLines,
      rows: [],
    }
  }

  const headerCells = matrix[headerRow - 1] ?? []
  const detectedHeader = detectedHeaderFrom(headerCells, "|")
  const cols = headerIndex(headerCells)
  const rows: PartnerDeliveryRow[] = []

  for (let i = headerRow; i < matrix.length; i++) {
    const cells = matrix[i] ?? []
    if (isTotalsRow(cells)) continue
    const reportDate = parseReportDate(col(cols, COL.day, cells))
    if (!reportDate) continue
    const partnerLineItemName =
      cellDisplay(col(cols, COL.mediaBuyName, cells)).trim() || null
    const impressions = parseNumber(col(cols, COL.impressions, cells))
    const clicks = parseNumber(col(cols, COL.clicks, cells))
    const videoViews = parseNumber(col(cols, COL.videoViews, cells))
    const rateQ25 = parseNumber(col(cols, COL.rateQ25, cells))
    const rateQ50 = parseNumber(col(cols, COL.rateQ50, cells))
    const rateQ75 = parseNumber(col(cols, COL.rateQ75, cells))
    const rateFullyPlayed = parseNumber(col(cols, COL.rateFullyPlayed, cells))
    rows.push({
      reportDate,
      partnerAdvertiserId:
        cellDisplay(col(cols, COL.advertiserId, cells)).trim() || null,
      partnerCampaignName:
        cellDisplay(col(cols, COL.campaignName, cells)).trim() || null,
      partnerLineItemName,
      avLineItemId: extractPlanCode(partnerLineItemName),
      impressions,
      clicks,
      videoViews,
      rateQ25,
      rateQ50,
      rateQ75,
      rateFullyPlayed,
      videoQ25: Math.round(rateQ25 * impressions),
      videoQ50: Math.round(rateQ50 * impressions),
      videoQ75: Math.round(rateQ75 * impressions),
      completedViews: Math.round(rateFullyPlayed * impressions),
    })
  }

  return {
    headerRow,
    preambleRowCount: headerRow - 1,
    detectedHeader,
    rawLines,
    rows,
  }
}

export async function parseChannelFactoryBuffer(
  buffer: Buffer,
  filename: string
): Promise<ParsedPartnerFile> {
  const matrix = await readPartnerFileMatrix(buffer, filename)
  return parsePartnerFileMatrix(matrix)
}
