import "server-only"

import { getCachedClientsList } from "@/lib/cache/clientsCache"
import { getLatestPublishedCampaignRead } from "@/lib/campaign-read/repo"
import { fetchAdServingPacingCampaignRows } from "@/lib/pacing/ad-serving/fetchAdServingPacingCampaignRows"
import { fetchSearchPacingCampaignRows } from "@/lib/pacing/campaigns/fetchSearchPacingCampaignRows"
import { pacingScopeKey } from "@/lib/pacing/campaigns/pacingRowsCache"
import {
  lineCardFromAdServing,
  lineCardFromProgrammatic,
  lineCardFromSearch,
  lineCardFromSocial,
  lineCardsFromDirectGroup,
} from "@/lib/pacing/channel/lineCardModel"
import type { LineCardModel } from "@/lib/pacing/channel/lineCardTypes"
import { fetchDirectPacingRows } from "@/lib/pacing/direct/fetchDirectPacingRows"
import { getAsOfDate } from "@/lib/pacing/maths"
import { assembleCampaignPacingRows } from "@/lib/pacing/portfolio/assembleCampaignPacingRows"
import { readPortfolioSnapshot } from "@/lib/pacing/portfolio/portfolioSnapshotStore"
import type { CampaignPacingRow } from "@/lib/pacing/portfolio/types"
import { fetchProgrammaticPacingCampaignRows } from "@/lib/pacing/programmatic/fetchProgrammaticPacingCampaignRows"
import { fetchSocialPacingCampaignRows } from "@/lib/pacing/social/fetchSocialPacingCampaignRows"
import { getCampaignPacingData } from "@/lib/snowflake/pacing-service"
import { getSearchCampaignsPacingData } from "@/lib/snowflake/search-campaigns-pacing"
import { assembleCampaignDetailPayload } from "./assembleCampaignDetailPayload"
import {
  logDailyFactsInput,
  normalizeDailyFactDate,
  type DailyFactPoint,
} from "./dailyFromFacts"
import { listCampaignDetailNotes } from "./notes"
import type { CampaignDetailDailyWindow, CampaignDetailPayload } from "./types"

export type BuildCampaignDetailArgs = {
  mbaNumber: string
  asOfDate?: string
  allowedClientSlugs: Set<string> | null
  window?: CampaignDetailDailyWindow
}

export class CampaignDetailError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
    this.name = "CampaignDetailError"
  }
}

function normMba(value: string): string {
  return value.trim().toLowerCase()
}

function sixtyDayStart(asOf: string): string {
  const end = Date.parse(`${asOf}T00:00:00Z`)
  if (!Number.isFinite(end)) return asOf
  return new Date(end - 59 * 86_400_000).toISOString().slice(0, 10)
}

async function fetchMbaChannelRows(args: {
  mbaNumber: string
  asOfDate: string
  allowedClientSlugs: Set<string> | null
}) {
  const common = {
    asOfDate: args.asOfDate,
    allowedClientSlugs: args.allowedClientSlugs,
    mbaNumber: args.mbaNumber,
  }
  const [search, social, programmatic, adServing, direct] = await Promise.all([
    fetchSearchPacingCampaignRows(common),
    fetchSocialPacingCampaignRows(common),
    fetchProgrammaticPacingCampaignRows(common),
    fetchAdServingPacingCampaignRows(common),
    fetchDirectPacingRows({ ...common, includeHistorical: false }),
  ])
  return { search, social, programmatic, adServing, direct }
}

function linesFromSources(
  sources: Awaited<ReturnType<typeof fetchMbaChannelRows>>,
  asOf: string,
): LineCardModel[] {
  return [
    ...sources.search.map((row) => lineCardFromSearch(row, asOf)),
    ...sources.social.map((row) => lineCardFromSocial(row, asOf)),
    ...sources.programmatic.map((row) => lineCardFromProgrammatic(row, asOf)),
    ...sources.adServing.map((row) => lineCardFromAdServing(row, asOf)),
    ...sources.direct.flatMap((group) => lineCardsFromDirectGroup(group, asOf)),
  ]
}

function channelOfLine(lines: LineCardModel[], lineItemId: string): LineCardModel | undefined {
  const id = lineItemId.trim().toLowerCase()
  return lines.find((line) => line.lineItemId.toLowerCase() === id)
}

function dailyQueryWindow(
  asOf: string,
  lines: LineCardModel[],
  window?: CampaignDetailDailyWindow,
) {
  const endDate = normalizeDailyFactDate(window?.date_to) ?? asOf
  if (window?.date_from) {
    return { startDate: normalizeDailyFactDate(window.date_from) ?? sixtyDayStart(endDate), endDate }
  }
  let startDate = sixtyDayStart(endDate)
  for (const line of lines) {
    if (line.lineStart && line.lineStart < startDate) startDate = line.lineStart
    for (const burst of line.planBursts) {
      if (burst.start < startDate) startDate = burst.start
    }
  }
  return { startDate, endDate }
}

function failedDailyQuery(label: string, mbaNumber: string, err: unknown): [] {
  console.warn("[dailyFactsForMba] query failed", {
    label,
    mba: mbaNumber,
    message: err instanceof Error ? err.message : String(err),
  })
  return []
}

async function dailyFactsForMba(
  mbaNumber: string,
  asOf: string,
  lines: LineCardModel[],
  window?: CampaignDetailDailyWindow,
): Promise<DailyFactPoint[]> {
  const searchIds = lines.filter((line) => line.channel === "search").map((line) => line.lineItemId)
  const otherIds = lines.filter((line) => line.channel !== "search").map((line) => line.lineItemId)
  const { startDate, endDate } = dailyQueryWindow(asOf, lines, window)
  const [searchRows, pacingRows] = await Promise.all([
    searchIds.length
      ? getSearchCampaignsPacingData({ lineItemIds: searchIds, startDate, endDate }).catch((err) =>
          failedDailyQuery("search", mbaNumber, err),
        )
      : Promise.resolve([]),
    otherIds.length
      ? getCampaignPacingData(mbaNumber, otherIds, { startDate, endDate }).catch((err) =>
          failedDailyQuery("social/other", mbaNumber, err),
        )
      : Promise.resolve([]),
  ])
  const facts: DailyFactPoint[] = []
  for (const row of searchRows) {
    const line = channelOfLine(lines, row.LINE_ITEM_ID)
    facts.push({
      date: normalizeDailyFactDate(row.DATE_DAY) ?? "",
      channelKey: line?.channel ?? "search",
      channelLabel: line ? `${line.channel} · ${line.platform}` : "Search",
      lineItemId: String(row.LINE_ITEM_ID ?? "").trim().toLowerCase(),
      spend: Number(row.AMOUNT_SPENT) || 0,
      impressions: Number(row.IMPRESSIONS) || 0,
      clicks: Number(row.CLICKS) || 0,
      views: 0,
      results: Number(row.CONVERSIONS) || 0,
    })
  }
  for (const row of pacingRows) {
    const line = channelOfLine(lines, row.lineItemId ?? "")
    facts.push({
      date: normalizeDailyFactDate(row.dateDay) ?? "",
      channelKey: line?.channel ?? "other",
      channelLabel: line ? `${line.channel} · ${line.platform}` : row.channel,
      lineItemId: String(row.lineItemId ?? "").trim().toLowerCase(),
      spend: Number(row.amountSpent) || 0,
      impressions: Number(row.impressions) || 0,
      clicks: Number(row.clicks) || 0,
      views: Number(row.video3sViews) || 0,
      results: Number(row.results) || 0,
    })
  }
  const kept = facts.filter((fact) => fact.date)
  logDailyFactsInput(mbaNumber, asOf, kept)
  return kept
}

function assertTenant(row: CampaignPacingRow, allowedClientSlugs: Set<string> | null) {
  if (allowedClientSlugs === null) return
  if (!row.clientSlug || !allowedClientSlugs.has(row.clientSlug)) {
    throw new CampaignDetailError(403, "forbidden")
  }
}

/**
 * Per-MBA campaign detail. Snapshot supplies the campaign row when present.
 * Channel composers run only for this MBA — never the portfolio book build.
 */
export async function buildCampaignDetail(
  args: BuildCampaignDetailArgs,
): Promise<CampaignDetailPayload> {
  const mba = args.mbaNumber.trim()
  if (!mba) throw new CampaignDetailError(400, "mba is required")
  const asOf = args.asOfDate?.trim() || getAsOfDate()
  const mbaKey = normMba(mba)

  const snapshot = await readPortfolioSnapshot({
    asOfDate: asOf,
    scopeKey: pacingScopeKey(args.allowedClientSlugs),
    liveOnly: true,
  }).catch(() => null)
  const snapshotRow =
    snapshot?.rows.find((row) => normMba(row.mbaNumber) === mbaKey) ?? null

  const sources = await fetchMbaChannelRows({
    mbaNumber: mba,
    asOfDate: asOf,
    allowedClientSlugs: args.allowedClientSlugs,
  })
  const lines = linesFromSources(sources, asOf)

  let row: CampaignPacingRow | undefined = snapshotRow ?? undefined
  if (!row) {
    const assembled = assembleCampaignPacingRows({
      asOfDate: asOf,
      allowedClientSlugs: args.allowedClientSlugs,
      search: sources.search,
      social: sources.social,
      programmatic: sources.programmatic,
      adServing: sources.adServing,
      direct: sources.direct,
      schedulesByMba: new Map(),
    })
    row = assembled.find((item) => normMba(item.mbaNumber) === mbaKey)
  }

  if (!row) throw new CampaignDetailError(404, "campaign_not_found")
  assertTenant(row, args.allowedClientSlugs)

  const planPerDayByChannel: Record<string, number> = {}
  for (const line of lines) {
    if (line.perDayPlan == null) continue
    planPerDayByChannel[line.channel] = (planPerDayByChannel[line.channel] ?? 0) + line.perDayPlan
  }

  const [read, notes, dailyFacts, clients] = await Promise.all([
    getLatestPublishedCampaignRead(mba).catch(() => null),
    listCampaignDetailNotes(mba),
    dailyFactsForMba(mba, asOf, lines, args.window),
    getCachedClientsList().catch(() => ({ data: [] as { id?: number; slug?: string }[] })),
  ])

  const slug = row.clientSlug.trim().toLowerCase()
  const client = clients.data.find(
    (item) => String(item?.slug ?? "").trim().toLowerCase() === slug,
  )
  const clientIdRaw = Number(client?.id)
  const clientId = Number.isFinite(clientIdRaw) && clientIdRaw > 0 ? clientIdRaw : null

  return assembleCampaignDetailPayload({
    row,
    lines,
    asOf,
    read,
    notes,
    dailyFacts,
    planPerDayByChannel,
    clientId,
    window: args.window,
  })
}
