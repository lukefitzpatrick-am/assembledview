import "server-only"

import { getCachedClientsList } from "@/lib/cache/clientsCache"
import { readPlanVersionSchedulesByIds } from "@/lib/data/readMediaPlans"
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
  withReconciledLineExpected,
} from "@/lib/pacing/channel/lineCardModel"
import { reconcileLineExpected } from "@/lib/spend/channelExpectedToDate"
import { loadAssumedExpectedLinesByVersion } from "@/lib/spend/loadAssumedExpectedLines"
import type { LineCardModel } from "@/lib/pacing/channel/lineCardTypes"
import { fetchDirectPacingRows } from "@/lib/pacing/direct/fetchDirectPacingRows"
import { resolveAdminPacingDays } from "@/lib/pacing/countTo"
import {
  feePctForScheduleMedia,
  type FeePctsByVersionId,
} from "@/lib/delivery/directDigitalFeeLookup"
import { loadDirectDigitalFeePctsOrGross } from "@/lib/delivery/readMbaFeeSnapshots"
import { assembleCampaignPacingRows } from "@/lib/pacing/portfolio/assembleCampaignPacingRows"
import { schedulesByMbaFromVersions } from "@/lib/pacing/portfolio/buildCampaignPacingRows"
import { chooseCampaignDetailRow, scheduleLoadedForMba } from "./chooseCampaignDetailRow"
import { readPortfolioSnapshot } from "@/lib/pacing/portfolio/portfolioSnapshotStore"
import { snapshotMatchesCountTo } from "@/lib/pacing/portfolio/servePortfolioSnapshot"
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
  /** View day. Liveness and the daily chart window. Defaults to Melbourne today. */
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
  countToDate: string
  allowedClientSlugs: Set<string> | null
}) {
  const common = {
    asOfDate: args.asOfDate,
    countToDate: args.countToDate,
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

function versionIdsFromSources(
  sources: Awaited<ReturnType<typeof fetchMbaChannelRows>>,
): number[] {
  const ids = new Set<number>()
  for (const row of [
    ...sources.search,
    ...sources.social,
    ...sources.programmatic,
    ...sources.adServing,
  ]) {
    if (Number.isInteger(row.mediaPlanVersionId) && row.mediaPlanVersionId > 0) {
      ids.add(row.mediaPlanVersionId)
    }
  }
  return [...ids]
}

function reconcileDetailLines(
  lines: LineCardModel[],
  channels: CampaignPacingRow["channels"] | undefined,
  asOf: string,
): LineCardModel[] {
  if (!channels || channels.length === 0) return lines
  const byId = new Map(lines.map((line) => [line.lineItemId.trim().toLowerCase(), line]))
  const next = new Map<string, LineCardModel>()
  for (const channel of channels) {
    const members = channel.lineItemIds
      .map((id) => byId.get(id.trim().toLowerCase()))
      .filter((line): line is LineCardModel => Boolean(line && !line.verificationOnly))
    if (members.length === 0) continue
    const allocated = reconcileLineExpected(
      channel.expectedToDate,
      members.map((line) => ({
        id: line.lineItemId,
        lineExpected: line.expectedToDate,
        plannedMedia: line.budget,
      })),
    )
    for (const line of members) {
      const dollars = allocated.get(line.lineItemId)
      if (dollars == null) continue
      next.set(line.lineItemId.trim().toLowerCase(), withReconciledLineExpected(line, dollars, asOf))
    }
  }
  return lines.map((line) => next.get(line.lineItemId.trim().toLowerCase()) ?? line)
}

function linesFromSources(
  sources: Awaited<ReturnType<typeof fetchMbaChannelRows>>,
  asOf: string,
  feePcts: FeePctsByVersionId,
): LineCardModel[] {
  return [
    ...sources.search.map((row) =>
      lineCardFromSearch(row, asOf, feePctForScheduleMedia(feePcts, row.mediaPlanVersionId, "search")),
    ),
    ...sources.social.map((row) =>
      lineCardFromSocial(
        row,
        asOf,
        feePctForScheduleMedia(feePcts, row.mediaPlanVersionId, "socialMedia"),
      ),
    ),
    ...sources.programmatic.map((row) =>
      lineCardFromProgrammatic(
        row,
        asOf,
        feePctForScheduleMedia(feePcts, row.mediaPlanVersionId, row.channelFamily),
      ),
    ),
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
 * Per-MBA campaign detail. Channel composers run only for this MBA.
 * Campaign expected is the delivery schedule on those version ids, the same
 * resolver the portfolio uses. A snapshot whose expected matches within $1
 * is kept. Never the portfolio book build, and never the lock-timed versions read.
 */
export async function buildCampaignDetail(
  args: BuildCampaignDetailArgs,
): Promise<CampaignDetailPayload> {
  const mba = args.mbaNumber.trim()
  if (!mba) throw new CampaignDetailError(400, "mba is required")
  // P1: counts to the day before the view day, like the client strip.
  const { asOfDate: asOf, countToDate: countTo } = resolveAdminPacingDays(args.asOfDate)
  const mbaKey = normMba(mba)

  const snapshot = await readPortfolioSnapshot({
    asOfDate: asOf,
    scopeKey: pacingScopeKey(args.allowedClientSlugs),
    liveOnly: true,
  }).catch(() => null)
  // A snapshot built before P1 counted to the view day: not comparable.
  const snapshotRow =
    snapshot && snapshotMatchesCountTo(snapshot, countTo)
      ? (snapshot.rows.find((row) => normMba(row.mbaNumber) === mbaKey) ?? null)
      : null

  const sources = await fetchMbaChannelRows({
    mbaNumber: mba,
    asOfDate: asOf,
    countToDate: countTo,
    allowedClientSlugs: args.allowedClientSlugs,
  })

  const versionIds = versionIdsFromSources(sources)
  const [scheduleVersions, feePctsByVersionId] = await Promise.all([
    versionIds.length > 0 ? readPlanVersionSchedulesByIds(versionIds) : Promise.resolve([]),
    loadDirectDigitalFeePctsOrGross(versionIds),
  ])
  const builtLines = linesFromSources(sources, countTo, feePctsByVersionId)
  const assumedByVersion = await loadAssumedExpectedLinesByVersion(versionIds, feePctsByVersionId)
  const schedulesByMba = schedulesByMbaFromVersions(scheduleVersions, assumedByVersion)
  const scheduleLoaded = scheduleLoadedForMba(schedulesByMba, mbaKey)
  const assembled = assembleCampaignPacingRows({
    asOfDate: asOf,
    countToDate: countTo,
    allowedClientSlugs: args.allowedClientSlugs,
    search: sources.search,
    social: sources.social,
    programmatic: sources.programmatic,
    adServing: sources.adServing,
    direct: sources.direct,
    schedulesByMba,
    feePctsByVersionId,
  })
  const freshRow = assembled.find((item) => normMba(item.mbaNumber) === mbaKey) ?? null
  const lines = reconcileDetailLines(builtLines, freshRow?.channels, countTo)
  const row =
    chooseCampaignDetailRow({
      mbaNumber: mba,
      snapshotRow,
      freshRow,
      scheduleLoaded,
    }) ?? undefined

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
    countTo,
    read,
    notes,
    dailyFacts,
    planPerDayByChannel,
    clientId,
    window: args.window,
  })
}
