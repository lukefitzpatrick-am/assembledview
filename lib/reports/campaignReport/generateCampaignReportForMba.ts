/**
 * Headless campaign report. Resolves the published version on the server,
 * builds the deck, and optionally stores it under exports/reports/{mba}/.
 */
import "server-only"

import { eq, sql } from "drizzle-orm"

import { getDb } from "@/db"
import { mediaPlanMasters, mediaPlanVersions } from "@/db/schema/planCore"
import type { DeliveryState } from "@/lib/delivery/deliveryState"
import {
  assembleCampaignReportData,
  type AssembleCampaignReportInput,
  type CampaignReportPayload,
} from "@/lib/reports/campaignReport/assembleCampaignReportData"
import { buildCampaignReportDeck } from "@/lib/reports/campaignReport/buildCampaignReportDeck"
import {
  generateReportCommentary,
  type GenerateReportCommentaryInput,
} from "@/lib/reports/campaignReport/generateReportCommentary"
import type { CampaignReportPeriodKind } from "@/lib/reports/campaignReport/periods"
import { storePerformanceReport } from "@/lib/reports/storePerformanceReport"

export type CampaignReportPeriodInput = {
  kind: CampaignReportPeriodKind
  start?: string
  end?: string
}

export type GenerateCampaignReportInput = {
  mbaNumber: string
  period: CampaignReportPeriodInput
  store: boolean
  withCommentary: boolean
}

export type PublishedCampaignReport = {
  versionNumber: number
  clientName: string
  campaignName: string
  campaignStartISO: string | null
  campaignEndISO: string | null
  mpSearchEnabled: boolean
}

export type GenerateCampaignReportResult = {
  buffer: Buffer
  fileName: string
  blobPathname?: string
  commentaryGenerated: boolean
  commentary: CampaignReportPayload["commentary"]
  /** YYYY-MM of the window start. Insight persist uses this as the period. */
  periodMonth: string
  /** Set when the period has no delivery source and no rows. No deck is built. */
  skipped?: string
}

export type GenerateCampaignReportDeps = {
  resolvePublished?: (mbaNumber: string) => Promise<PublishedCampaignReport | null>
  assemble?: (input: AssembleCampaignReportInput) => Promise<CampaignReportPayload>
  buildDeck?: (payload: CampaignReportPayload) => Promise<Buffer>
  storeReport?: typeof storePerformanceReport
  generateCommentary?: (input: GenerateReportCommentaryInput) => Promise<CampaignReportPayload["commentary"]>
}

function isTruthyFlag(value: unknown): boolean {
  if (value === true || value === 1) return true
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase()
    return normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "y" || normalized === "on"
  }
  if (typeof value === "number") return Number.isFinite(value) && value !== 0
  return false
}

function dateOnly(value: unknown): string | null {
  if (value == null || value === "") return null
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10)
  }
  const text = String(value).trim()
  return text ? text.slice(0, 10) : null
}

/** Search is on only when the published version's channel flag says so. */
export function mpSearchEnabledFromFlags(flags: unknown): boolean {
  if (!flags || typeof flags !== "object") return false
  const rec = flags as Record<string, unknown>
  if ("search" in rec) return isTruthyFlag(rec.search)
  if ("mp_search" in rec) return isTruthyFlag(rec.mp_search)
  return false
}

function namePart(value: string, fallback: string): string {
  const cleaned = value
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
  return cleaned || fallback
}

/** Clean download name. Blob storage adds its own random suffix. */
export function campaignReportDownloadName(input: {
  clientName: string
  campaignName: string
  periodStartISO: string
}): string {
  const month = input.periodStartISO.slice(0, 7)
  const client = namePart(input.clientName, "client")
  const campaign = namePart(input.campaignName, "campaign")
  return `${client}-${campaign}-report-${month}.pptx`
}

/**
 * Skip a blank deck when every line is unconnected or has not reported.
 * spend_only and reported lines are real delivery and are not skipped.
 */
export function campaignReportSkipReason(
  states: readonly DeliveryState[] | undefined,
): string | null {
  if (!states) return null
  if (states.length === 0) return "No delivery reported for this period."
  const blank = states.every((state) => state === "no_source" || state === "no_rows_yet")
  if (!blank) return null
  if (states.every((state) => state === "no_source")) {
    return "No delivery source is connected for this period."
  }
  if (states.every((state) => state === "no_rows_yet")) {
    return "Delivery has not reported yet for this period."
  }
  return "No delivery reported for this period."
}

export async function resolvePublishedCampaignReport(
  mbaNumber: string,
): Promise<PublishedCampaignReport | null> {
  const mba = mbaNumber.trim().toLowerCase()
  if (!mba) return null
  const db = getDb()
  const masters = await db
    .select({
      clientName: mediaPlanMasters.mpClientName,
      campaignName: mediaPlanMasters.campaignName,
      campaignStartDate: mediaPlanMasters.campaignStartDate,
      campaignEndDate: mediaPlanMasters.campaignEndDate,
      publishedVersionId: mediaPlanMasters.publishedVersionId,
    })
    .from(mediaPlanMasters)
    .where(sql`lower(${mediaPlanMasters.mbaNumber}) = ${mba}`)
    .limit(1)
  const master = masters[0]
  if (!master?.publishedVersionId) return null

  const versions = await db
    .select({
      versionNumber: mediaPlanVersions.versionNumber,
      campaignName: mediaPlanVersions.campaignName,
      campaignStartDate: mediaPlanVersions.campaignStartDate,
      campaignEndDate: mediaPlanVersions.campaignEndDate,
      channelFlags: mediaPlanVersions.channelFlags,
      publishedAt: mediaPlanVersions.publishedAt,
    })
    .from(mediaPlanVersions)
    .where(eq(mediaPlanVersions.id, master.publishedVersionId))
    .limit(1)
  const version = versions[0]
  if (!version?.publishedAt) return null

  return {
    versionNumber: version.versionNumber,
    clientName: (master.clientName ?? "").trim(),
    campaignName: (version.campaignName ?? master.campaignName ?? "").trim(),
    campaignStartISO: dateOnly(version.campaignStartDate ?? master.campaignStartDate),
    campaignEndISO: dateOnly(version.campaignEndDate ?? master.campaignEndDate),
    mpSearchEnabled: mpSearchEnabledFromFlags(version.channelFlags),
  }
}

export async function generateCampaignReportForMba(
  input: GenerateCampaignReportInput,
  deps?: GenerateCampaignReportDeps,
): Promise<GenerateCampaignReportResult> {
  const mbaNumber = input.mbaNumber.trim()
  if (!mbaNumber) throw new Error("mbaNumber is required")

  const resolve = deps?.resolvePublished ?? resolvePublishedCampaignReport
  const identity = await resolve(mbaNumber)
  if (!identity) {
    throw new Error("A published version is required")
  }

  const assemble = deps?.assemble ?? assembleCampaignReportData
  const payload = await assemble({
    mbaNumber,
    clientName: identity.clientName,
    campaignName: identity.campaignName,
    versionNumber: identity.versionNumber,
    campaignStartISO: identity.campaignStartISO,
    campaignEndISO: identity.campaignEndISO,
    periodKind: input.period.kind,
    customStartISO: input.period.kind === "custom" ? input.period.start : undefined,
    customEndISO: input.period.kind === "custom" ? input.period.end : undefined,
    mpSearchEnabled: identity.mpSearchEnabled,
    generateCommentary: async () => null,
  })

  const skipped = campaignReportSkipReason(payload.deliveryStates)
  const periodMonth = payload.period.current.startISO.slice(0, 7)
  const fileName = campaignReportDownloadName({
    clientName: payload.clientName,
    campaignName: payload.campaignName,
    periodStartISO: payload.period.current.startISO,
  })
  if (skipped) {
    return {
      buffer: Buffer.alloc(0),
      fileName,
      commentaryGenerated: false,
      commentary: null,
      periodMonth,
      skipped,
    }
  }

  if (input.withCommentary) {
    const write = deps?.generateCommentary ?? generateReportCommentary
    try {
      payload.commentary = await write({
        mbaNumber,
        period: payload.period,
        reportData: payload,
      })
    } catch (err) {
      console.error("[campaign-report] commentary failed", {
        mbaNumber,
        error: err instanceof Error ? err.message : String(err),
      })
      payload.commentary = null
    }
  }

  const build = deps?.buildDeck ?? buildCampaignReportDeck
  const buffer = await build(payload)
  let blobPathname: string | undefined
  if (input.store) {
    const store = deps?.storeReport ?? storePerformanceReport
    const stored = await store(mbaNumber, fileName, buffer)
    blobPathname = stored.pathname
  }

  const commentary = payload.commentary
  return {
    buffer,
    fileName,
    blobPathname,
    commentaryGenerated: Boolean(commentary && commentary.items.length > 0),
    commentary,
    periodMonth,
  }
}
