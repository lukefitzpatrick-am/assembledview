import { VISTAR_COL } from "../columnNames"
import { PartnerIngestError } from "../errors"
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

export { VISTAR_EXPECTED_HEADER } from "../columnNames"

/** Every column the parser reads. A missing one fails the file by name. */
const REQUIRED_COLUMNS = [
  VISTAR_COL.day,
  VISTAR_COL.venueType,
  VISTAR_COL.advertiser,
  VISTAR_COL.contractNumber,
  VISTAR_COL.campaignName,
  VISTAR_COL.campaignId,
  VISTAR_COL.creativeName,
  VISTAR_COL.creativeId,
  VISTAR_COL.metroArea,
  VISTAR_COL.state,
  VISTAR_COL.impressions,
  VISTAR_COL.spots,
  VISTAR_COL.revenue,
] as const

function text(cols: Map<string, number>, name: string, cells: unknown[]): string | null {
  return cellDisplay(col(cols, name, cells)).trim() || null
}

export function parseVistarMatrix(matrix: unknown[][]): ParsedPartnerFile {
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
  const detectedHeader = detectedHeaderFrom(headerCells, ",")
  const cols = headerIndex(headerCells)
  for (const name of REQUIRED_COLUMNS) {
    if (!cols.has(name)) {
      throw new PartnerIngestError(`missing required column: ${name}`)
    }
  }

  const rows: PartnerDeliveryRow[] = []
  for (let i = headerRow; i < matrix.length; i++) {
    const cells = matrix[i] ?? []
    // Blank Day is the trailing totals row (and any padding). It stays in rawLines only.
    if (cellDisplay(col(cols, VISTAR_COL.day, cells)).trim() === "") continue
    const reportDate = parseReportDate(col(cols, VISTAR_COL.day, cells))
    if (!reportDate) continue
    rows.push({
      reportDate,
      partnerAdvertiserId: text(cols, VISTAR_COL.advertiser, cells),
      partnerCampaignName: text(cols, VISTAR_COL.campaignName, cells),
      partnerLineItemName: text(cols, VISTAR_COL.creativeName, cells),
      avLineItemId: extractPlanCode(text(cols, VISTAR_COL.contractNumber, cells)),
      // Fractional on the exchange report. Rounded once, at the INSERT.
      impressions: parseNumber(col(cols, VISTAR_COL.impressions, cells)),
      clicks: 0,
      videoViews: 0,
      videoQ25: 0,
      videoQ50: 0,
      videoQ75: 0,
      completedViews: 0,
      rateQ25: 0,
      rateQ50: 0,
      rateQ75: 0,
      rateFullyPlayed: 0,
      amountSpent: parseNumber(col(cols, VISTAR_COL.revenue, cells)),
      plays: parseNumber(col(cols, VISTAR_COL.spots, cells)),
      venueType: text(cols, VISTAR_COL.venueType, cells),
      metroArea: text(cols, VISTAR_COL.metroArea, cells),
      state: text(cols, VISTAR_COL.state, cells),
      partnerCampaignId: text(cols, VISTAR_COL.campaignId, cells),
      partnerCreativeId: text(cols, VISTAR_COL.creativeId, cells),
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

export async function parseVistarBuffer(
  buffer: Buffer,
  filename: string
): Promise<ParsedPartnerFile> {
  const matrix = await readPartnerFileMatrix(buffer, filename)
  return parseVistarMatrix(matrix)
}
