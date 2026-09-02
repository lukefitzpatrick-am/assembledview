import type { RmBlock, RmDataRow, RmWorkbookParse } from "./royMorganTypes"

export const TRANSPORT_BLOCK_CAP = 40
export const TRANSPORT_ROW_CAP = 1500
export const TRANSPORT_LABEL_CAP = 200

function truncLabel(value: string): { value: string; truncated: boolean } {
  if (value.length <= TRANSPORT_LABEL_CAP) return { value, truncated: false }
  return { value: value.slice(0, TRANSPORT_LABEL_CAP), truncated: true }
}

function truncNullable(value: string | null): { value: string | null; truncated: boolean } {
  if (value == null) return { value, truncated: false }
  const next = truncLabel(value)
  return { value: next.value, truncated: next.truncated }
}

function capRow(row: RmDataRow): { row: RmDataRow; truncated: boolean } {
  const label = truncLabel(row.label)
  const section = truncNullable(row.section)
  return {
    row: { ...row, label: label.value, section: section.value },
    truncated: label.truncated || section.truncated,
  }
}

function capBlock(block: RmBlock): { block: RmBlock; rowCapped: boolean; labelTruncated: boolean } {
  const col = truncLabel(block.columnName)
  let labelTruncated = col.truncated
  let rows = block.rows
  let rowCapped = false
  if (rows.length > TRANSPORT_ROW_CAP) {
    rows = rows.slice(0, TRANSPORT_ROW_CAP)
    rowCapped = true
  }
  const cappedRows: RmDataRow[] = []
  for (const row of rows) {
    const next = capRow(row)
    if (next.truncated) labelTruncated = true
    cappedRows.push(next.row)
  }
  return {
    block: { ...block, columnName: col.value, rows: cappedRows },
    rowCapped,
    labelTruncated,
  }
}

/**
 * Response-only cap. Persist the full parse_json; never call this before insert.
 */
export function capParseForTransport(parse: RmWorkbookParse): {
  parse: RmWorkbookParse
  cap_hit: string[]
} {
  const hits = new Set<string>()
  let blocksKept = 0
  let droppedBlocks = false
  const sheets = parse.sheets.map((sheet) => {
    const blocks: RmBlock[] = []
    for (const block of sheet.blocks) {
      if (blocksKept >= TRANSPORT_BLOCK_CAP) {
        droppedBlocks = true
        continue
      }
      blocksKept += 1
      const next = capBlock(block)
      if (next.rowCapped) hits.add("rows")
      if (next.labelTruncated) hits.add("labels")
      blocks.push(next.block)
    }
    return { ...sheet, blocks }
  })
  if (droppedBlocks) hits.add("blocks")
  return { parse: { ...parse, sheets }, cap_hit: [...hits] }
}
