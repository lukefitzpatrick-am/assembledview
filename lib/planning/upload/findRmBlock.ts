import type { RmBlock, RmSheet, RmWorkbookParse } from "./royMorganTypes"

export function findRmBlock(
  parse: RmWorkbookParse,
  sheetName: string,
  blockId: string
): { sheet: RmSheet; block: RmBlock; baseBlock: RmBlock | null } | null {
  const sheet = parse.sheets.find((s) => s.sheetName === sheetName)
  if (!sheet) return null
  const block = sheet.blocks.find((b) => b.blockId === blockId)
  if (!block) return null
  const baseBlock = sheet.blocks.find((b) => b.isBase) ?? null
  return { sheet, block, baseBlock }
}
