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

type WorkbookMbaData = NonNullable<Parameters<typeof generateMediaPlan>[2]>

export type MediaPlanWorkbookInput = {
  header: MediaPlanHeader
  mediaItems: MediaItems
  mbaData: WorkbookMbaData
  variant: "standard" | "aa"
  draft: boolean
  kpiRows?: KPISheetRow[]
  clientName: string
  campaignName: string
  versionNumber: number
}

function filenameToken(raw: string): string {
  const s = raw.trim() || "campaign"
  return s.replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "").replace(/\s+/g, "_")
}

export function mediaPlanFileName(input: {
  clientName: string
  campaignName: string
  versionNumber: number
  variant: "standard" | "aa"
  draft: boolean
}): string {
  if (input.draft) {
    const campaign = filenameToken(input.campaignName)
    return input.variant === "aa"
      ? `DRAFT-AA-MediaPlan_${campaign}_not-for-client.xlsx`
      : `DRAFT-MediaPlan_${campaign}_not-for-client.xlsx`
  }
  const base = `${input.clientName || "client"}-MediaPlan_${input.campaignName || "campaign"}-v${input.versionNumber}.xlsx`
  return input.variant === "aa" ? `AA - ${base}` : base
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
    addKPISheet(workbook, kpiRows, { draft: input.draft })
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
