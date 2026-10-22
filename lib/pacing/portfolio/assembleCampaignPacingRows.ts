import {
  deliverySourceLookupKey,
  lookupActiveDeliverySource,
} from "@/lib/delivery/deliverySourceMap"
import { estimateDirectDigitalSpend } from "@/lib/delivery/estimateDirectDigitalSpend"
import {
  channelKeyForAdServingFamily,
  feePctFromVersionMap,
  type FeePctsByVersionId,
} from "@/lib/delivery/directDigitalFeeLookup"
import {
  computeCampaignDays,
  computeDaysPassed,
  computeDaysRemaining,
  getMelbourneYesterdayISO,
} from "@/lib/pacing/maths"
import {
  deliveryStatusFromPct,
  type DeliveryStatus,
} from "@/lib/pacing/deliveryStatusFromPct"
import type { SearchPacingCampaignRow } from "@/lib/pacing/campaigns/types"
import type { SocialPacingCampaignRow } from "@/lib/pacing/social/types"
import type { ProgrammaticPacingCampaignRow } from "@/lib/pacing/programmatic/types"
import type { AdServingPacingCampaignRow } from "@/lib/pacing/ad-serving/types"
import { lineIsAssumedSpend } from "@/lib/pacing/direct/assumedSpendLine"
import type { DirectCampaignGroup, DirectLineItemRow } from "@/lib/pacing/direct/types"
import { MEDIA_TYPE_ID_CODES } from "@/lib/mediaplan/lineItemIds"
import { slugifyPlanClientName } from "@/lib/pacing/scope/resolveClientSlugs"
import { campaignEndedBefore, isListedOnAdminPacing } from "@/lib/pacing/endedCampaigns"
import { composerCountToISO, isIsoDay } from "@/lib/pacing/countTo"
import {
  expectedSpendToDateFromDeliveryScheduleMonthly,
  resolveMonthlySpendForPlan,
} from "@/lib/spend/monthlyPlanCalendar"
import { hasPositiveDelivery } from "@/lib/spend/assumeSpendRule"
import { assumedDeliveryPacePct, assumedLineToDateCents } from "@/lib/spend/assumedSpend"
import type { AssumedExpectedLine } from "@/lib/spend/assumedSpend"
import { fromCents, toCents } from "@/lib/money/cents"
import { resolveCampaignExpectedSpendToDate } from "@/lib/spend/resolveCampaignExpectedSpend"
import {
  channelExpectedToDate,
  reconcileLineExpected,
  scheduleKeyForPortfolioChannel,
  slicesByKey,
} from "@/lib/spend/channelExpectedToDate"
import { isAttentionRow, isOverPacing } from "./portfolioRowFlags"
import type {
  CampaignPacingRow,
  CampaignScheduleInput,
  ChannelPacingRow,
  ChannelSourceState,
  ChannelSpendMode,
  PortfolioPace,
} from "./types"

export { countPortfolioRows, isAttentionRow, isOverPacing } from "./portfolioRowFlags"

export type AssembleCampaignPacingRowsInput = {
  /** View day. Decides which campaigns are live. */
  asOfDate: string
  /**
   * Last day counted (P1, `lib/pacing/countTo.ts`). Expected, assumed spend,
   * days elapsed and not-started checks use it. The channel rows passed in
   * must be counted to the same day. Unset counts to `asOfDate`.
   */
  countToDate?: string
  allowedClientSlugs: Set<string> | null
  liveOnly?: boolean
  search: SearchPacingCampaignRow[]
  social: SocialPacingCampaignRow[]
  programmatic: ProgrammaticPacingCampaignRow[]
  adServing: AdServingPacingCampaignRow[]
  direct: DirectCampaignGroup[]
  schedulesByMba: Map<string, CampaignScheduleInput>
  /** Channel fee percents from `mba_fee_snapshots` for the versions in this build. */
  feePctsByVersionId?: FeePctsByVersionId
}

type DraftChannel = {
  channelKey: string
  label: string
  spendToDate: number
  budget: number
  spendYesterday: number
  spendMode: ChannelSpendMode
  deliverable: ChannelPacingRow["deliverable"]
  lineItemIds: string[]
  lineStart: string | null
  hasSource: boolean
  hasFactRows: boolean
  kpiTotal: number
  kpiTracked: number
  contributesSpend: boolean
  /** Estimated dollars already added, so reported spend can replace them. */
  estimatedByLine?: Map<string, { spend: number; budget: number }>
}

type DraftCampaign = {
  mbaNumber: string
  versionNumber: number
  clientName: string
  clientSlug: string
  campaignName: string
  status: string
  startDate: string
  endDate: string
  channels: Map<string, DraftChannel>
}

function normMba(mba: string): string {
  return mba.trim().toLowerCase()
}

function finite(n: number | null | undefined): number {
  return typeof n === "number" && Number.isFinite(n) ? n : 0
}

function moneyLabel(n: number): string {
  return `$${Math.round(n).toLocaleString("en-AU")}`
}

function dailyMultiple(actual: number, plan: number): string {
  if (!(plan > 0)) return "0.0"
  return (actual / plan).toFixed(1)
}

function mapDeliveryPace(status: DeliveryStatus): PortfolioPace {
  if (status === "ahead") return "ahead"
  if (status === "behind") return "behind"
  if (status === "on-track") return "on_track"
  return "no_delivery"
}

function progFamilyLabel(family: ProgrammaticPacingCampaignRow["channelFamily"]): string {
  if (family === "progDisplay") return "Prog display"
  if (family === "progOoh") return "Prog ooh"
  return "Prog video"
}

function adServingLabel(family: AdServingPacingCampaignRow["channelFamily"]): string {
  if (family === "digitalDisplay") return "Digital Display"
  if (family === "digitalVideo") return "Digital Video"
  if (family === "digitalAudio") return "Digital Audio"
  return "BVOD"
}

function adServingKey(family: AdServingPacingCampaignRow["channelFamily"]): string {
  if (family === "digitalDisplay") return "digital-display"
  if (family === "digitalVideo") return "digital-video"
  if (family === "digitalAudio") return "digital-audio"
  return "bvod"
}

function socialLabel(platform: SocialPacingCampaignRow["socialPlatform"]): string {
  if (platform === "tiktok") return "Social · TikTok"
  if (platform === "reddit") return "Social · Reddit"
  return "Social · Meta"
}

const MEDIA_TYPE_LABELS: Record<string, string> = {
  television: "Television",
  newspaper: "Newspaper",
  socialMedia: "Social",
  radio: "Radio",
  magazines: "Magazines",
  cinema: "Cinema",
  digitalDisplay: "Digital Display",
  digitalAudio: "Digital Audio",
  digitalVideo: "Digital Video",
  bvod: "BVOD",
  integration: "Integration",
  search: "Search",
  progDisplay: "Prog display",
  progVideo: "Prog video",
  progBVOD: "Prog BVOD",
  progAudio: "Prog audio",
  progOOH: "Prog ooh",
  ooh: "OOH",
  influencers: "Influencers",
  production: "Production",
}

const MEDIA_TYPE_CODES_BY_LENGTH = [...Object.values(MEDIA_TYPE_ID_CODES), "ML"].toSorted(
  (a, b) => b.length - a.length,
)

const MEDIA_TYPE_BY_CODE = new Map(
  Object.entries(MEDIA_TYPE_ID_CODES).map(([key, code]) => [code.toLowerCase(), key]),
)

function mediaTypeFromLineItemId(lineItemId: string): { key: string; label: string } {
  const id = lineItemId.trim()
  for (const code of MEDIA_TYPE_CODES_BY_LENGTH) {
    if (!new RegExp(`${code}\\d+$`, "i").test(id)) continue
    if (code.toUpperCase() === "ML") return { key: "direct", label: "Direct" }
    const typeKey = MEDIA_TYPE_BY_CODE.get(code.toLowerCase())
    return {
      key: code.toLowerCase(),
      label: (typeKey && MEDIA_TYPE_LABELS[typeKey]) || code,
    }
  }
  return { key: "direct", label: "Direct" }
}

function owningChannelForLine(campaign: DraftCampaign, lineItemId: string): DraftChannel | undefined {
  const needle = lineItemId.trim().toLowerCase()
  for (const ch of campaign.channels.values()) {
    if (ch.lineItemIds.some((id) => id.trim().toLowerCase() === needle)) return ch
  }
  return undefined
}

function lineYesterdayReported(li: DirectLineItemRow, yesterdayISO: string): number {
  return li.daily.reduce((sum, day) => {
    return sum + (day.dateDay === yesterdayISO ? finite(day.reportedSpend) : 0)
  }, 0)
}

function attributeReportedToChannel(
  owner: DraftChannel,
  li: DirectLineItemRow,
  yesterdayISO: string,
): void {
  const prior = owner.estimatedByLine?.get(li.lineItemId.trim().toLowerCase())
  if (prior) {
    owner.spendToDate -= prior.spend
    owner.budget -= prior.budget
    owner.estimatedByLine?.delete(li.lineItemId.trim().toLowerCase())
  }
  owner.spendToDate += finite(li.totalReported)
  owner.budget += finite(li.totalBudget)
  owner.spendYesterday += lineYesterdayReported(li, yesterdayISO)
  const stillEstimated = [...(owner.estimatedByLine?.values() ?? [])].some((entry) => entry.spend > 0)
  owner.spendMode = stillEstimated ? "estimated" : "reported"
  owner.contributesSpend = true
  owner.hasSource = true
  owner.hasFactRows =
    owner.hasFactRows || finite(li.totalReported) > 0 || li.daily.length > 0
}

function titleCasePublisher(raw: string): string {
  return raw
    .split(/\s+/)
    .map((part) => (part ? part[0]!.toUpperCase() + part.slice(1) : part))
    .join(" ")
}

function ensureCampaign(
  bag: Map<string, DraftCampaign>,
  identity: {
    mbaNumber: string
    versionNumber: number
    clientName: string
    campaignName: string
    status: string
    startDate: string
    endDate: string
  },
): DraftCampaign {
  const key = normMba(identity.mbaNumber)
  const existing = bag.get(key)
  if (existing) {
    if (existing.versionNumber === 0 && identity.versionNumber > 0) {
      existing.versionNumber = identity.versionNumber
    }
    return existing
  }
  const row: DraftCampaign = {
    mbaNumber: identity.mbaNumber,
    versionNumber: identity.versionNumber,
    clientName: identity.clientName,
    clientSlug: slugifyPlanClientName(identity.clientName),
    campaignName: identity.campaignName,
    status: identity.status,
    startDate: identity.startDate,
    endDate: identity.endDate,
    channels: new Map(),
  }
  bag.set(key, row)
  return row
}

function upsertChannel(campaign: DraftCampaign, next: DraftChannel): DraftChannel {
  const existing = campaign.channels.get(next.channelKey)
  if (!existing) {
    campaign.channels.set(next.channelKey, next)
    return next
  }
  existing.spendToDate += next.spendToDate
  existing.budget += next.budget
  existing.spendYesterday += next.spendYesterday
  existing.hasFactRows = existing.hasFactRows || next.hasFactRows
  existing.hasSource = existing.hasSource || next.hasSource
  existing.kpiTotal += next.kpiTotal
  existing.kpiTracked += next.kpiTracked
  existing.contributesSpend = existing.contributesSpend || next.contributesSpend
  if (next.spendMode === "estimated" && existing.spendMode !== "reported") {
    existing.spendMode = "estimated"
  }
  if (next.estimatedByLine) {
    if (!existing.estimatedByLine) existing.estimatedByLine = new Map()
    for (const [id, entry] of next.estimatedByLine) existing.estimatedByLine.set(id, entry)
  }
  if (next.lineStart && (!existing.lineStart || next.lineStart < existing.lineStart)) {
    existing.lineStart = next.lineStart
  }
  for (const id of next.lineItemIds) {
    if (!existing.lineItemIds.includes(id)) existing.lineItemIds.push(id)
  }
  if (!existing.deliverable && next.deliverable) existing.deliverable = next.deliverable
  else if (existing.deliverable && next.deliverable && existing.deliverable.unit === next.deliverable.unit) {
    existing.deliverable = {
      unit: existing.deliverable.unit,
      delivered: existing.deliverable.delivered + next.deliverable.delivered,
      planned: existing.deliverable.planned + next.deliverable.planned,
    }
  }
  return existing
}

function kpiBits(
  targets: SearchPacingCampaignRow["kpiTargets"],
  hasActuals: boolean,
  planCpvRate?: number | null,
): {
  kpiTotal: number
  kpiTracked: number
} {
  // A plan CPV is always a target (23 Oct), with or without a saved KPI row.
  const hasPlanCpv = planCpvRate != null && planCpvRate > 0
  if (!targets && !hasPlanCpv) return { kpiTotal: 0, kpiTracked: 0 }
  return { kpiTotal: 1, kpiTracked: hasActuals ? 1 : 0 }
}

function sourceStateFor(args: {
  asOfDate: string
  lineStart: string | null
  campaignStart: string
  hasSource: boolean
  hasFactRows: boolean
}): ChannelSourceState {
  if (args.hasFactRows) return "reporting"
  const start = args.lineStart ?? args.campaignStart
  if (start && start > args.asOfDate) return "not_started"
  if (!args.hasSource) return "no_source"
  return "connecting"
}

function channelSpendPct(args: {
  spendToDate: number
  expectedToDate: number
  deliverable: ChannelPacingRow["deliverable"]
  timePct: number
  contributesSpend: boolean
}): number {
  if (args.contributesSpend && args.expectedToDate > 0) {
    return (args.spendToDate / args.expectedToDate) * 100
  }
  if (args.deliverable && args.deliverable.planned > 0 && args.timePct > 0) {
    const expectedUnits = args.deliverable.planned * (args.timePct / 100)
    if (expectedUnits > 0) return (args.deliverable.delivered / expectedUnits) * 100
  }
  if (args.expectedToDate > 0) return (args.spendToDate / args.expectedToDate) * 100
  return Number.NaN
}

function channelPace(args: {
  asOfDate: string
  campaignStart: string
  lineStart: string | null
  daysElapsed: number
  sourceState: ChannelSourceState
  hasFactRows: boolean
  spendPct: number
  /** Assumed spend is on track from its own burst figure, including before Snowflake rows exist. */
  assumedDelivery?: boolean
}): PortfolioPace {
  const start = args.lineStart ?? args.campaignStart
  if (start && start > args.asOfDate) return "not_started"
  if (args.assumedDelivery) {
    return mapDeliveryPace(deliveryStatusFromPct(Number.isFinite(args.spendPct) ? args.spendPct : undefined))
  }
  if (args.sourceState === "no_source") return "no_source"
  if (args.daysElapsed >= 2 && !args.hasFactRows) return "no_delivery"
  return mapDeliveryPace(deliveryStatusFromPct(Number.isFinite(args.spendPct) ? args.spendPct : undefined))
}

function sortCampaignRows(rows: CampaignPacingRow[]): CampaignPacingRow[] {
  return rows.toSorted((a, b) => {
    const rank = (row: CampaignPacingRow) => {
      if (isAttentionRow(row)) return 0
      if (row.pace === "not_started") return 2
      return 1
    }
    const ra = rank(a)
    const rb = rank(b)
    if (ra !== rb) return ra - rb
    if (ra === 2) return a.startDate.localeCompare(b.startDate) || a.mbaNumber.localeCompare(b.mbaNumber)
    if (b.moneyAtRisk !== a.moneyAtRisk) return b.moneyAtRisk - a.moneyAtRisk
    return a.mbaNumber.localeCompare(b.mbaNumber)
  })
}

function whySentence(row: CampaignPacingRow): string {
  if (row.ended) {
    return `Ended ${row.endDate}. Delivered ${moneyLabel(row.spendToDate)} of ${moneyLabel(row.expectedToDate)} expected for the full flight (${Math.round(row.spendPct)}%).`
  }
  if (isOverPacing(row)) {
    const channel =
      row.channels
        .filter((ch) => ch.expectedToDate > 0)
        .toSorted((a, b) => b.spendPct - a.spendPct)[0] ?? row.channels[0]
    const days = row.daysElapsed > 0 ? row.daysElapsed : 1
    const actual = (channel?.spendToDate ?? row.spendToDate) / days
    const plan = (channel?.expectedToDate ?? row.expectedToDate) / days
    const finish = row.projectedFinish ?? 0
    return `${channel?.label ?? "Search"} is spending at ${dailyMultiple(actual, plan)}× the daily plan; projected finish ${moneyLabel(finish)} against ${moneyLabel(row.budget)}.`
  }

  const noSource = row.channels.find((ch) => ch.sourceState === "no_source" || ch.pace === "no_source")
  if (noSource) {
    return `${noSource.label} has no source connected, so the campaign cannot read on track.`
  }

  if (row.pace === "no_delivery") {
    const silent = row.channels.find((ch) => ch.pace === "no_delivery") ?? row.channels[0]
    return `${row.daysElapsed} days in flight and no rows from ${silent?.label ?? "the plan"}.`
  }

  if (row.pace === "behind") {
    const worst =
      row.channels
        .filter((ch) => ch.pace === "behind")
        .toSorted((a, b) => a.spendPct - b.spendPct)[0] ?? row.channels[0]
    const others = row.channels.filter((ch) => ch.pace === "on_track").map((ch) => ch.label)
    const head = `${worst?.label ?? "Search"} is ${Math.round(worst?.spendPct ?? row.spendPct)}% of expected`
    if (others.length === 0) return `${head}.`
    return `${head}; ${others.join(", ")} on track.`
  }

  return `Delivery is ${Math.round(row.spendPct)}% of expected with ${row.daysLeft} days left.`
}

/**
 * Same step-3 figure the campaign page passes (`metrics.expectedSpendToDate`):
 * delivery-schedule monthly media on the campaign dates. An explicit schedule
 * value wins so a caller can hand in the page's already-computed metric.
 */
function metricsExpectedForCampaign(
  schedule: CampaignScheduleInput | undefined,
  startDate: string,
  endDate: string,
  asOfISO: string,
): number | undefined {
  const explicit = schedule?.metricsExpectedSpendToDate
  if (typeof explicit === "number" && Number.isFinite(explicit)) return explicit
  const computed = expectedSpendToDateFromDeliveryScheduleMonthly(schedule?.deliverySchedule, {
    campaignStartISO: startDate,
    campaignEndISO: endDate,
    asOfISO,
    basis: "media",
  })
  return computed > 0 ? computed : undefined
}

function positiveMetric(value: number | null | undefined): boolean {
  return typeof value === "number" && Number.isFinite(value) && value > 0
}

/**
 * Line ids that already have impressions, clicks, or spend on rows this
 * assemble call loaded. Assumed-spend daily facts are not delivery.
 */
function deliveryPresenceIds(input: AssembleCampaignPacingRowsInput): Set<string> {
  const ids = new Set<string>()
  const add = (lineItemId: string | null | undefined) => {
    const key = String(lineItemId ?? "").trim().toLowerCase()
    if (key) ids.add(key)
  }
  for (const row of input.search) {
    if (
      hasPositiveDelivery({
        impressions: row.impressions,
        clicks: row.clicks,
        spend: row.spendToDateLineTotal,
      })
    ) {
      add(row.lineItemId)
    }
  }
  for (const row of input.social) {
    if (
      hasPositiveDelivery({
        impressions: row.impressions,
        clicks: row.clicks,
        spend: row.spendToDateLineTotal,
      })
    ) {
      add(row.lineItemId)
    }
  }
  for (const row of input.programmatic) {
    if (
      hasPositiveDelivery({
        impressions: row.impressions,
        clicks: row.clicks,
        spend: row.spendToDateLineTotal,
      })
    ) {
      add(row.lineItemId)
    }
  }
  for (const row of input.adServing) {
    if (hasPositiveDelivery({ impressions: row.impressions, clicks: row.clicks })) {
      add(row.lineItemId)
    }
  }
  for (const group of input.direct) {
    for (const line of group.lineItems) {
      if (lineIsAssumedSpend(line)) continue
      const dailySpend = line.daily.some(
        (day) => positiveMetric(day.reportedSpend) || positiveMetric(day.actualPlatformSpend),
      )
      const dailyUnits = line.daily.some((day) => positiveMetric(day.actualDeliverables))
      if (
        hasPositiveDelivery({
          spend: positiveMetric(line.totalReported) ? line.totalReported : line.totalActual,
        }) ||
        dailySpend ||
        dailyUnits
      ) {
        add(line.lineItemId)
      }
    }
  }
  return ids
}

function assumedLinesWithoutDelivery(
  lines: readonly AssumedExpectedLine[] | undefined,
  presence: ReadonlySet<string>,
): AssumedExpectedLine[] {
  return (lines ?? []).filter((line) => !presence.has(line.id.trim().toLowerCase()))
}

function expectedForCampaign(
  schedule: CampaignScheduleInput | undefined,
  startDate: string,
  endDate: string,
  asOfISO: string,
): number {
  const monthlySpend =
    schedule?.monthlySpend ??
    resolveMonthlySpendForPlan(undefined, undefined, schedule?.deliverySchedule)
  return resolveCampaignExpectedSpendToDate({
    billingSchedule: schedule?.billingSchedule,
    deliverySchedule: schedule?.deliverySchedule,
    monthlySpend,
    campaignStartISO: startDate,
    campaignEndISO: endDate,
    monthlyOpts: {
      campaignStartISO: startDate,
      campaignEndISO: endDate,
      asOfISO,
      basis: "media",
    },
    metricsExpectedSpendToDate: metricsExpectedForCampaign(schedule, startDate, endDate, asOfISO),
    basis: "media",
    assumedLines: schedule?.assumedLines,
  })
}

function assumedDollarsByChannel(
  lines: readonly AssumedExpectedLine[] | undefined,
  asOf: string,
): Map<string, number> {
  const cents = new Map<string, number>()
  for (const line of lines ?? []) {
    const media = mediaTypeFromLineItemId(line.id)
    const key = `assumed-${media.key}`
    cents.set(key, (cents.get(key) ?? 0) + assumedLineToDateCents(line, asOf))
  }
  const out = new Map<string, number>()
  for (const [key, value] of cents) out.set(key, fromCents(value))
  return out
}

function applyAssumedPlanChannels(
  campaign: DraftCampaign,
  lines: readonly AssumedExpectedLine[] | undefined,
  asOf: string,
): void {
  if (!lines || lines.length === 0) return
  const groups = new Map<string, { label: string; ids: string[]; cents: number; planned: number }>()
  for (const line of lines) {
    const owner = owningChannelForLine(campaign, line.id)
    if (owner && owner.spendMode !== "assumed") continue
    const media = mediaTypeFromLineItemId(line.id)
    const bucket = groups.get(media.key) ?? { label: media.label, ids: [], cents: 0, planned: 0 }
    bucket.ids.push(line.id)
    bucket.cents += assumedLineToDateCents(line, asOf)
    bucket.planned += line.plannedMedia
    groups.set(media.key, bucket)
  }
  for (const [code, bucket] of groups) {
    const channelKey = `assumed-${code}`
    const spend = fromCents(bucket.cents)
    const existing = campaign.channels.get(channelKey)
    if (existing) {
      if (!(existing.spendToDate > 0)) existing.spendToDate = spend
      if (!(existing.budget > 0)) existing.budget = bucket.planned
      existing.hasFactRows = true
      existing.hasSource = true
      existing.contributesSpend = true
      existing.spendMode = "assumed"
      for (const id of bucket.ids) {
        if (!existing.lineItemIds.includes(id)) existing.lineItemIds.push(id)
      }
      continue
    }
    upsertChannel(campaign, {
      channelKey,
      label: bucket.label,
      spendToDate: spend,
      budget: bucket.planned,
      spendYesterday: 0,
      spendMode: "assumed",
      deliverable: null,
      lineItemIds: bucket.ids,
      lineStart: campaign.startDate,
      hasSource: true,
      hasFactRows: true,
      contributesSpend: true,
      kpiTotal: 0,
      kpiTracked: 0,
    })
  }
}

function channelExpectedDollars(
  channels: DraftChannel[],
  schedule: CampaignScheduleInput | undefined,
  startDate: string,
  endDate: string,
  asOfISO: string,
  campaignExpected: number,
  spendBudget: number,
): Map<string, number> {
  const slices = slicesByKey(
    channelExpectedToDate({
      deliverySchedule: schedule?.deliverySchedule,
      campaignStartISO: startDate,
      campaignEndISO: endDate,
      asOfISO,
      assumedLines: schedule?.assumedLines,
    }),
  )
  const out = new Map<string, number>()
  if (slices.size === 0) {
    for (const channel of channels) {
      const share = spendBudget > 0 && channel.contributesSpend ? channel.budget / spendBudget : 0
      out.set(channel.channelKey, channel.contributesSpend ? campaignExpected * share : 0)
    }
    return out
  }
  const groups = new Map<string, DraftChannel[]>()
  for (const channel of channels) {
    const key = scheduleKeyForPortfolioChannel(channel.channelKey, channel.label)
    if (!key || !slices.has(key)) {
      out.set(channel.channelKey, 0)
      continue
    }
    const list = groups.get(key) ?? []
    list.push(channel)
    groups.set(key, list)
  }
  const assumedByChannel = assumedDollarsByChannel(schedule?.assumedLines, asOfISO)
  for (const [key, members] of groups) {
    const assumedMembers = members.filter((channel) => assumedByChannel.has(channel.channelKey))
    const reported = members.filter((channel) => !assumedByChannel.has(channel.channelKey))
    let remainingCents = toCents(slices.get(key) ?? 0)
    for (const member of assumedMembers) {
      const dollars = assumedByChannel.get(member.channelKey) ?? 0
      out.set(member.channelKey, dollars)
      remainingCents -= toCents(dollars)
    }
    if (reported.length === 0) continue
    const allocated = reconcileLineExpected(
      fromCents(Math.max(0, remainingCents)),
      reported.map((channel) => ({
        id: channel.channelKey,
        lineExpected: 0,
        plannedMedia: channel.budget,
      })),
    )
    for (const [channelKey, dollars] of allocated) out.set(channelKey, dollars)
  }
  return out
}

export function assembleCampaignPacingRows(input: AssembleCampaignPacingRowsInput): CampaignPacingRow[] {
  const liveOnly = input.liveOnly !== false
  const countTo = composerCountToISO(input)
  const stampCountTo = isIsoDay(input.countToDate)
  const bag = new Map<string, DraftCampaign>()
  const platformLineIds = new Set<string>()
  const deliveryIds = deliveryPresenceIds(input)

  function notePlatformLine(lineItemId: string): void {
    const key = lineItemId.trim().toLowerCase()
    if (key) platformLineIds.add(key)
  }

  for (const row of input.search) {
    const campaign = ensureCampaign(bag, {
      mbaNumber: row.mbaNumber,
      versionNumber: row.mediaPlanVersionNumber,
      clientName: row.clientName,
      campaignName: row.campaignName,
      status: row.campaignStatus,
      startDate: row.campaignStartDate,
      endDate: row.campaignEndDate,
    })
    const hasFacts = finite(row.spendToDateLineTotal) > 0 || finite(row.impressions) > 0
    notePlatformLine(row.lineItemId)
    upsertChannel(campaign, {
      channelKey: "search",
      label: "Search",
      spendToDate: finite(row.spendToDateLineTotal),
      budget: finite(row.totalLineItemBudget),
      spendYesterday: finite(row.spendYesterday),
      spendMode: "actual",
      deliverable:
        finite(row.impressions) > 0 || finite(row.clicks) > 0
          ? { unit: "impressions", delivered: finite(row.impressions), planned: 0 }
          : null,
      lineItemIds: [row.lineItemId],
      lineStart: row.lineItemStartDate,
      hasSource: true,
      hasFactRows: hasFacts,
      contributesSpend: true,
      ...kpiBits(row.kpiTargets, hasFacts),
    })
  }

  for (const row of input.social) {
    const campaign = ensureCampaign(bag, {
      mbaNumber: row.mbaNumber,
      versionNumber: row.mediaPlanVersionNumber,
      clientName: row.clientName,
      campaignName: row.campaignName,
      status: row.campaignStatus,
      startDate: row.campaignStartDate,
      endDate: row.campaignEndDate,
    })
    const hasFacts = finite(row.spendToDateLineTotal) > 0 || finite(row.impressions) > 0
    notePlatformLine(row.lineItemId)
    const metric = row.deliverableMetric === "VIDEO_3S_VIEWS" ? "views" : "impressions"
    upsertChannel(campaign, {
      channelKey: `social-${row.socialPlatform}`,
      label: socialLabel(row.socialPlatform),
      spendToDate: finite(row.spendToDateLineTotal),
      budget: finite(row.totalLineItemBudget),
      spendYesterday: finite(row.spendYesterday),
      spendMode: "actual",
      deliverable: {
        unit: metric,
        delivered: finite(row.deliverableActual),
        planned: finite(row.deliverableTarget),
      },
      lineItemIds: [row.lineItemId],
      lineStart: row.lineItemStartDate,
      hasSource: true,
      hasFactRows: hasFacts,
      contributesSpend: true,
      ...kpiBits(row.kpiTargets, hasFacts, row.planCpvRate),
    })
  }

  for (const row of input.programmatic) {
    const deferred = row.spendPacingDeferredToDirect === true || row.fixedCostMedia === true
    const campaign = ensureCampaign(bag, {
      mbaNumber: row.mbaNumber,
      versionNumber: row.mediaPlanVersionNumber,
      clientName: row.clientName,
      campaignName: row.campaignName,
      status: row.campaignStatus,
      startDate: row.campaignStartDate,
      endDate: row.campaignEndDate,
    })
    const lookupKey = deliverySourceLookupKey(row.platform, row.platformLabel)
    const mapRow = lookupActiveDeliverySource(lookupKey)
    const modelled = mapRow?.derive_spend_from_plan === true
    const hasFacts =
      finite(row.spendToDateLineTotal) > 0 || finite(row.impressions) > 0 || finite(row.deliverableActual) > 0
    const publisher = (row.platformLabel || row.platform || "").trim()
    notePlatformLine(row.lineItemId)
    upsertChannel(campaign, {
      channelKey: `${row.snowflakeChannel}:${lookupKey || publisher.toLowerCase()}`,
      label: publisher
        ? `${progFamilyLabel(row.channelFamily)} · ${titleCasePublisher(publisher)}`
        : progFamilyLabel(row.channelFamily),
      spendToDate: deferred ? 0 : finite(row.spendToDateLineTotal),
      budget: deferred ? 0 : finite(row.totalLineItemBudget),
      spendYesterday: deferred ? 0 : finite(row.spendYesterday),
      spendMode: modelled ? "modelled" : deferred ? "reported" : "actual",
      deliverable: {
        unit: row.deliverableMetric === "VIDEO_3S_VIEWS" ? "views" : "impressions",
        delivered: finite(row.deliverableActual),
        planned: finite(row.deliverableTarget),
      },
      lineItemIds: [row.lineItemId],
      lineStart: row.lineItemStartDate,
      hasSource: Boolean(mapRow),
      hasFactRows: hasFacts,
      contributesSpend: !deferred,
      ...kpiBits(row.kpiTargets, hasFacts, row.planCpvRate),
    })
  }

  for (const row of input.adServing) {
    const campaign = ensureCampaign(bag, {
      mbaNumber: row.mbaNumber,
      versionNumber: row.mediaPlanVersionNumber,
      clientName: row.clientName,
      campaignName: row.campaignName,
      status: row.campaignStatus,
      startDate: row.campaignStartDate,
      endDate: row.campaignEndDate,
    })
    const lookupKey = deliverySourceLookupKey(row.platform, row.platform)
    const mapRow = lookupActiveDeliverySource(lookupKey)
    const hasFacts =
      finite(row.impressions) > 0 || finite(row.clicks) > 0 || finite(row.daysActive) > 0
    const planned = finite(row.deliverableTarget) || finite(row.plannedImpressions)
    const buy = String(row.buyType ?? "").trim().toLowerCase()
    const estimate =
      mapRow?.derive_spend_from_plan === true || buy === "fixed_cost"
        ? null
        : estimateDirectDigitalSpend({
            lineItemId: row.lineItemId,
            buyType: row.buyType,
            budgetIncludesFees: row.budgetIncludesFees === true,
            feePct: feePctFromVersionMap(
              input.feePctsByVersionId,
              row.mediaPlanVersionId,
              channelKeyForAdServingFamily(row.channelFamily),
            ),
            versionId: row.mediaPlanVersionId,
            bursts: row.bursts,
            days: [
              {
                date: row.lineItemEndDate || row.campaignEndDate || countTo,
                impressions: row.impressions,
                clicks: row.clicks,
                results: row.results,
                video3sViews: row.videoCompletes,
              },
            ],
          })
    const estimatedAmount = estimate?.amount != null && estimate.amount > 0 ? estimate.amount : 0
    const plannedMedia = estimate?.plannedMedia ?? 0
    const estimatedBudget = plannedMedia > 0 ? plannedMedia : 0
    const lineKey = row.lineItemId.trim().toLowerCase()
    notePlatformLine(row.lineItemId)
    upsertChannel(campaign, {
      channelKey: adServingKey(row.channelFamily),
      label: adServingLabel(row.channelFamily),
      spendToDate: estimatedAmount,
      budget: estimatedBudget,
      spendYesterday: 0,
      spendMode: mapRow?.derive_spend_from_plan
        ? "modelled"
        : estimatedAmount > 0
          ? "estimated"
          : "actual",
      ...(estimatedAmount > 0
        ? {
            estimatedByLine: new Map([[lineKey, { spend: estimatedAmount, budget: estimatedBudget }]]),
          }
        : {}),
      deliverable:
        planned > 0 || finite(row.deliverableActual) > 0
          ? {
              unit: row.deliverableKind === "clicks" ? "clicks" : "impressions",
              delivered: finite(row.deliverableActual),
              planned,
            }
          : null,
      lineItemIds: [row.lineItemId],
      lineStart: row.lineItemStartDate,
      hasSource: Boolean(mapRow),
      hasFactRows: hasFacts,
      contributesSpend: estimatedAmount > 0,
      kpiTotal: 0,
      kpiTracked: 0,
    })
  }

  for (const group of input.direct) {
    const campaign = ensureCampaign(bag, {
      mbaNumber: group.mbaNumber,
      versionNumber: 0,
      clientName: group.clientName,
      campaignName: group.campaignName,
      status: group.campaignStatus,
      startDate: group.campaignStartDate,
      endDate: group.campaignEndDate,
    })
    const yesterdayISO = getMelbourneYesterdayISO(input.asOfDate)
    const leftovers = new Map<string, { label: string; lines: DirectLineItemRow[] }>()
    const assumed = new Map<string, { label: string; lines: DirectLineItemRow[] }>()

    for (const li of group.lineItems) {
      if (lineIsAssumedSpend(li)) {
        if (platformLineIds.has(li.lineItemId.trim().toLowerCase())) continue
        const media = mediaTypeFromLineItemId(li.lineItemId)
        const bucket = assumed.get(media.key)
        if (bucket) bucket.lines.push(li)
        else assumed.set(media.key, { label: media.label, lines: [li] })
        continue
      }
      const owner = owningChannelForLine(campaign, li.lineItemId)
      if (owner) {
        attributeReportedToChannel(owner, li, yesterdayISO)
        continue
      }
      const media = mediaTypeFromLineItemId(li.lineItemId)
      const bucket = leftovers.get(media.key)
      if (bucket) bucket.lines.push(li)
      else leftovers.set(media.key, { label: media.label, lines: [li] })
    }

    for (const [code, bucket] of assumed) {
      const spend = bucket.lines.reduce((sum, li) => sum + finite(li.totalReported), 0)
      const budget = bucket.lines.reduce((sum, li) => sum + finite(li.totalBudget), 0)
      const yesterday = bucket.lines.reduce(
        (sum, li) => sum + lineYesterdayReported(li, yesterdayISO),
        0,
      )
      const hasDaily = bucket.lines.some((li) => li.daily.length > 0)
      upsertChannel(campaign, {
        channelKey: `assumed-${code}`,
        label: bucket.label,
        spendToDate: spend,
        budget,
        spendYesterday: yesterday,
        spendMode: "assumed",
        deliverable: null,
        lineItemIds: bucket.lines.map((li) => li.lineItemId),
        lineStart: group.campaignStartDate,
        hasSource: hasDaily,
        hasFactRows: hasDaily,
        contributesSpend: true,
        kpiTotal: 0,
        kpiTracked: 0,
      })
    }

    for (const [code, bucket] of leftovers) {
      const spend = bucket.lines.reduce((sum, li) => sum + finite(li.totalReported), 0)
      const budget = bucket.lines.reduce((sum, li) => sum + finite(li.totalBudget), 0)
      const yesterday = bucket.lines.reduce(
        (sum, li) => sum + lineYesterdayReported(li, yesterdayISO),
        0,
      )
      upsertChannel(campaign, {
        channelKey: code === "direct" ? "direct" : `direct-${code}`,
        label: code === "direct" ? "Direct" : `Direct · ${bucket.label}`,
        spendToDate: spend,
        budget,
        spendYesterday: yesterday,
        spendMode: "reported",
        deliverable: null,
        lineItemIds: bucket.lines.map((li) => li.lineItemId),
        lineStart: group.campaignStartDate,
        hasSource: true,
        hasFactRows: spend > 0 || bucket.lines.some((li) => li.daily.length > 0),
        contributesSpend: true,
        kpiTotal: 0,
        kpiTracked: 0,
      })
    }
  }

  const assembled: CampaignPacingRow[] = []

  for (const draft of bag.values()) {
    if (input.allowedClientSlugs !== null && !input.allowedClientSlugs.has(draft.clientSlug)) {
      continue
    }
    if (
      liveOnly &&
      // Live on the view day, or ended within ENDED_CAMPAIGN_LISTED_DAYS (23 Oct).
      !isListedOnAdminPacing(draft.status, draft.startDate, draft.endDate, input.asOfDate)
    ) {
      continue
    }

    const mbaKey = normMba(draft.mbaNumber)
    const schedule =
      input.schedulesByMba.get(`${mbaKey}:${draft.versionNumber}`) ??
      input.schedulesByMba.get(mbaKey)
    const assumedLines = assumedLinesWithoutDelivery(schedule?.assumedLines, deliveryIds)
    const pacedSchedule = schedule ? { ...schedule, assumedLines } : undefined
    applyAssumedPlanChannels(draft, assumedLines, countTo)
    const daysTotal = computeCampaignDays(draft.startDate, draft.endDate)
    const daysElapsed = computeDaysPassed(draft.startDate, draft.endDate, countTo)
    const daysLeft = computeDaysRemaining(draft.startDate, draft.endDate, countTo)
    const timePct = daysTotal > 0 ? (daysElapsed / daysTotal) * 100 : 0
    const expectedToDate = expectedForCampaign(pacedSchedule, draft.startDate, draft.endDate, countTo)

    const channelList = [...draft.channels.values()]
    const spendBudget = channelList
      .filter((ch) => ch.contributesSpend)
      .reduce((sum, ch) => sum + ch.budget, 0)
    const budget =
      schedule?.campaignBudget && schedule.campaignBudget > 0 ? schedule.campaignBudget : spendBudget
    const spendToDate = channelList
      .filter((ch) => ch.contributesSpend)
      .reduce((sum, ch) => sum + ch.spendToDate, 0)
    const spendYesterday = channelList
      .filter((ch) => ch.contributesSpend)
      .reduce((sum, ch) => sum + ch.spendYesterday, 0)
    const spendPct =
      expectedToDate > 0
        ? (spendToDate / expectedToDate) * 100
        : toCents(spendToDate) === 0 && channelList.some((ch) => ch.spendMode === "assumed")
          ? 100
          : Number.NaN
    const projectedFinish = timePct > 0 ? (spendToDate / timePct) * 100 : null
    const dailyRateActual = daysElapsed > 0 ? spendToDate / daysElapsed : 0
    const dailyRatePlan = daysElapsed > 0 ? expectedToDate / daysElapsed : 0
    const anyFact = channelList.some((ch) => ch.hasFactRows)
    const kpiTotal = channelList.reduce((sum, ch) => sum + ch.kpiTotal, 0)
    const kpiTracked = channelList.reduce((sum, ch) => sum + ch.kpiTracked, 0)

    const expectedByChannel = channelExpectedDollars(
      channelList,
      pacedSchedule,
      draft.startDate,
      draft.endDate,
      countTo,
      expectedToDate,
      spendBudget,
    )
    const assumedByChannel = assumedDollarsByChannel(assumedLines, countTo)
    const channels: ChannelPacingRow[] = channelList.map((ch) => {
      const channelExpected = expectedByChannel.get(ch.channelKey) ?? 0
      const assumedDelivery = ch.spendMode === "assumed" && assumedByChannel.has(ch.channelKey)
      const sourceState = sourceStateFor({
        asOfDate: countTo,
        lineStart: ch.lineStart,
        campaignStart: draft.startDate,
        hasSource: assumedDelivery || ch.hasSource,
        hasFactRows: assumedDelivery || ch.hasFactRows,
      })
      const pct = assumedDelivery
        ? assumedDeliveryPacePct(ch.spendToDate, channelExpected)
        : channelSpendPct({
            spendToDate: ch.spendToDate,
            expectedToDate: channelExpected,
            deliverable: ch.deliverable,
            timePct,
            contributesSpend: ch.contributesSpend,
          })
      const pace = channelPace({
        asOfDate: countTo,
        campaignStart: draft.startDate,
        lineStart: ch.lineStart,
        daysElapsed,
        sourceState,
        hasFactRows: assumedDelivery || ch.hasFactRows,
        spendPct: pct,
        assumedDelivery,
      })
      return {
        channelKey: ch.channelKey,
        label: ch.label,
        spendToDate: ch.spendToDate,
        budget: ch.budget,
        expectedToDate: channelExpected,
        spendPct: Number.isFinite(pct) ? pct : 0,
        pace,
        spendMode: ch.spendMode,
        deliverable: ch.deliverable,
        sourceState,
        lineItemIds: ch.lineItemIds,
      }
    })

    let pace: PortfolioPace
    if (draft.startDate > countTo) {
      pace = "not_started"
    } else if (channels.some((ch) => ch.sourceState === "no_source" || ch.pace === "no_source")) {
      pace = "no_source"
    } else if (daysElapsed >= 2 && !anyFact) {
      pace = "no_delivery"
    } else {
      pace = mapDeliveryPace(deliveryStatusFromPct(Number.isFinite(spendPct) ? spendPct : undefined))
    }

    const row: CampaignPacingRow = {
      mbaNumber: draft.mbaNumber,
      versionNumber: draft.versionNumber,
      clientName: draft.clientName,
      clientSlug: draft.clientSlug,
      campaignName: draft.campaignName,
      status: draft.status,
      startDate: draft.startDate,
      endDate: draft.endDate,
      daysElapsed,
      daysTotal,
      daysLeft,
      timePct,
      budget,
      spendToDate,
      expectedToDate,
      spendPct: Number.isFinite(spendPct) ? spendPct : 0,
      pace,
      projectedFinish,
      spendYesterday,
      dailyRateActual,
      dailyRatePlan,
      kpi: kpiTotal > 0 ? { tracked: kpiTracked, total: kpiTotal } : null,
      moneyAtRisk: Math.abs(expectedToDate - spendToDate),
      why: "",
      channels,
      ...(stampCountTo ? { countToDate: countTo } : {}),
      ...(campaignEndedBefore(draft.endDate, input.asOfDate) ? { ended: true } : {}),
    }
    row.why = whySentence(row)
    assembled.push(row)
  }

  return sortCampaignRows(assembled)
}
