import { detectPlanStructure } from "./detectPlanStructure"
import { mapPlanWithClaude } from "./mapPlanWithClaude"
import { summariseMapperResult } from "./toFormLineItems"
import type { AutopopulateChannel, DetectedSheet, MapperResult } from "./types"

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
  const mapped = await mapPlanWithClaude({ detected, channel: input.channel })

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
    },
    mapped,
    summary: summariseMapperResult(mapped),
  }
}
