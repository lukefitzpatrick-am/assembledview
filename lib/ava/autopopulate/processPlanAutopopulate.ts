import { detectPlanStructure } from "./detectPlanStructure"
import { mapPlanWithClaude } from "./mapPlanWithClaude"
import { summariseMapperResult } from "./toFormLineItems"
import type {
  AutopopulateChannel,
  DetectedSheet,
  MappedLineItem,
  MapperResult,
} from "./types"

export type ProcessPlanAutopopulateResult = {
  channel: AutopopulateChannel
  detected: Pick<
    DetectedSheet,
    | "sheetName"
    | "meta"
    | "headerRow"
    | "flight"
    | "costColumns"
    | "junkColumns"
    | "lineItemColumns"
    | "dataRowRange"
    | "isBonusSheet"
    | "bonusSheets"
  >
  mapped: MapperResult
  summary: string
}

export async function processPlanAutopopulate(input: {
  buffer: Buffer
  fileName: string
  channel: AutopopulateChannel
}): Promise<ProcessPlanAutopopulateResult> {
  const lower = input.fileName.toLowerCase()
  if (!lower.endsWith(".xlsx") && !lower.endsWith(".xls")) {
    throw new Error("P1 supports xlsx/xls only. PDF/CSV/DOCX come in a later phase.")
  }

  const detected = await detectPlanStructure(input.buffer)
  const mapped = await mapPlanWithClaude({
    detected,
    channel: input.channel,
  })

  const bonusLineItems: MappedLineItem[] = []
  const bonusNeeds = mapped.needs_review.slice()
  const bonusWarnings = mapped.warnings.slice()

  for (const bonus of detected.bonusSheets ?? []) {
    const bonusMapped = await mapPlanWithClaude({
      detected: bonus,
      channel: input.channel,
    })
    for (const li of bonusMapped.line_items) {
      bonusLineItems.push({ ...li, is_bonus: true })
    }
    for (const n of bonusMapped.needs_review) {
      bonusNeeds.push({
        ...n,
        reason: `[bonus:${bonus.sheetName}] ${n.reason}`,
      })
    }
    for (const w of bonusMapped.warnings) {
      bonusWarnings.push(`[bonus:${bonus.sheetName}] ${w}`)
    }
  }

  if (bonusLineItems.length) {
    mapped.line_items = [...mapped.line_items, ...bonusLineItems]
    mapped.needs_review = bonusNeeds
    mapped.warnings = bonusWarnings
  }

  return {
    channel: input.channel,
    detected: {
      sheetName: detected.sheetName,
      meta: detected.meta,
      headerRow: detected.headerRow,
      flight: detected.flight,
      costColumns: detected.costColumns,
      junkColumns: detected.junkColumns,
      lineItemColumns: detected.lineItemColumns,
      dataRowRange: detected.dataRowRange,
      isBonusSheet: detected.isBonusSheet,
      bonusSheets: detected.bonusSheets?.map((b) => ({
        ...b,
        // Drop nested grids from API surface size; mapper already consumed them.
        grid: [],
        bonusSheets: undefined,
      })),
    },
    mapped,
    summary: summariseMapperResult(mapped),
  }
}
