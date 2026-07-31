/**
 * Maps Stage A brief fields onto the export-deck / PPTX brief payload.
 * Campaign name must never be replaced by brand or client.
 */

export type ExportDeckBriefSource = {
  clientName: string
  brandOverride: string
  campaignName: string
  category: string
  market?: string
  objectiveKind: string | null
  budget: number
  startDate: string | null
  endDate: string | null
}

export type ExportDeckBriefPayload = {
  clientName: string | undefined
  /** Optional brand line — never used as campaignName. */
  brandOverride: string | undefined
  campaignName: string | undefined
  category: string | undefined
  market: string
  objectiveKind: string | undefined
  budget: number | undefined
  startDate: string | null
  endDate: string | null
}

export function buildExportDeckBrief(brief: ExportDeckBriefSource): ExportDeckBriefPayload {
  return {
    clientName: brief.clientName.trim() || undefined,
    brandOverride: brief.brandOverride.trim() || undefined,
    campaignName: brief.campaignName.trim() || undefined,
    category: brief.category.trim() || undefined,
    market: brief.market?.trim() || "Australia",
    objectiveKind: brief.objectiveKind || undefined,
    budget: brief.budget > 0 ? brief.budget : undefined,
    startDate: brief.startDate,
    endDate: brief.endDate,
  }
}
