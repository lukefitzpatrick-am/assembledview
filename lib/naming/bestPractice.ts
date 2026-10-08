import type ExcelJS from "exceljs"

import { ARGB_INK_TEXT, excelFont, INK_FILL } from "@/lib/excel/brandSheet"
import type { BestPractice } from "@/lib/types/bestPractice"
import { isEmptyBestPractice } from "@/lib/types/bestPractice"
import type { Publisher } from "@/lib/types/publisher"

export type PublisherMatchItem = {
  publisher?: unknown
  platform?: unknown
  site?: unknown
  network?: unknown
}

const norm = (s?: string | null) => String(s ?? "").trim().toLowerCase()

/**
 * Publishers that appear on the given line items and have non-empty best practice.
 * Matches by publisher_name or publisherid (case-insensitive).
 */
export function chosenPublishersFor(
  list: PublisherMatchItem[],
  publishers: Publisher[],
): Publisher[] {
  const byName = new Map(
    publishers.map((publisher) => [norm(publisher.publisher_name), publisher]),
  )
  const byId = new Map(
    publishers.map((publisher) => [norm(publisher.publisherid), publisher]),
  )
  const seen = new Set<number>()
  const out: Publisher[] = []

  for (const item of list) {
    const cands = [item.platform, item.publisher, item.site, item.network]
      .map((v) => norm(v == null ? "" : String(v)))
      .filter(Boolean)

    for (const candidate of cands) {
      const publisher = byName.get(candidate) ?? byId.get(candidate)
      if (publisher && !seen.has(publisher.id)) {
        seen.add(publisher.id)
        out.push(publisher)
      }
    }
  }

  return out.filter((publisher) => !isEmptyBestPractice(publisher.best_practice))
}

/**
 * Render a titled best-practice block. Returns the next free row index.
 * Sources: media_container_best_practice and publisher.best_practice.
 */
export function renderBestPracticeBlock(
  sheet: ExcelJS.Worksheet,
  startRow: number,
  title: string,
  bp: BestPractice,
  colSpan: number,
): number {
  if (isEmptyBestPractice(bp) || !bp) return startRow

  let rowIndex = startRow
  sheet.mergeCells(rowIndex, 1, rowIndex, colSpan)
  const titleCell = sheet.getCell(rowIndex, 1)
  titleCell.value = title
  titleCell.font = excelFont({ bold: true, size: 11, color: { argb: ARGB_INK_TEXT } })
  titleCell.fill = INK_FILL
  rowIndex++

  for (const section of bp.sections) {
    if ((section.heading?.trim() ?? "") !== "") {
      const headingCell = sheet.getCell(rowIndex, 1)
      headingCell.value = section.heading
      headingCell.font = excelFont({ bold: true })
      rowIndex++
    }

    for (const item of section.items ?? []) {
      if (item.trim() === "") continue
      sheet.getCell(rowIndex, 1).value = `• ${item}`
      rowIndex++
    }
  }

  return rowIndex + 1
}
