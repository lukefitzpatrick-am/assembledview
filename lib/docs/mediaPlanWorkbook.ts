/**
 * One server entry for a media plan workbook: filename, draft stamp and the
 * KPI sheet. Draft and published renders both call this. Row building stays
 * with the caller (explode on draft, persisted adapter on publish, including
 * the legacy billing-blob fee fallback).
 */
import { addKPISheet, generateMediaPlan } from "@/lib/generateMediaPlan"
import type {
  GenerateMediaPlanOptions,
  KPISheetRow,
  MediaItems,
  MediaPlanHeader,
} from "@/lib/generateMediaPlan"
import { planDocumentFileName } from "@/lib/docs/planDocumentFileName"

type WorkbookMbaData = NonNullable<Parameters<typeof generateMediaPlan>[2]>

export type MediaPlanWorkbookInput = {
  header: MediaPlanHeader
  mediaItems: MediaItems
  mbaData: WorkbookMbaData
  variant: "standard" | "aa"
  draft: boolean
  kpiRows?: KPISheetRow[]
  publishers?: ReadonlyArray<{
    publisherid?: string | null
    publisher_name?: string | null
  }>
  clientName: string
  campaignName: string
  versionNumber: number
}

export function mediaPlanFileName(input: {
  clientName: string
  campaignName: string
  versionNumber: number
  variant: "standard" | "aa"
  draft: boolean
}): string {
  return planDocumentFileName({
    clientName: input.clientName,
    campaignName: input.campaignName,
    kind: input.variant === "aa" ? "aa_media_plan" : "media_plan",
    draft: input.draft,
    versionNumber: input.versionNumber,
  })
}

export async function buildMediaPlanWorkbook(
  input: MediaPlanWorkbookInput,
): Promise<{ buffer: Buffer; fileName: string }> {
  const options: GenerateMediaPlanOptions = {
    draft: input.draft,
    ...(input.variant === "aa" ? { mbaTotalsLayout: "aa" as const } : {}),
  }
  const workbook = await generateMediaPlan(
    input.header,
    input.mediaItems,
    input.mbaData,
    options,
  )
  const kpiRows = input.kpiRows ?? []
  if (input.variant === "standard" && kpiRows.length > 0) {
    addKPISheet(workbook, kpiRows, {
      draft: input.draft,
      publishers: input.publishers,
    })
  }
  const buffer = Buffer.from((await workbook.xlsx.writeBuffer()) as ArrayBuffer)
  return {
    buffer,
    fileName: mediaPlanFileName({
      clientName: input.clientName,
      campaignName: input.campaignName,
      versionNumber: input.versionNumber,
      variant: input.variant,
      draft: input.draft,
    }),
  }
}
