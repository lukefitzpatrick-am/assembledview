import type { SearchPacingCampaignRow } from "@/lib/pacing/campaigns/types"
import type { SocialPacingCampaignRow } from "@/lib/pacing/social/types"
import type { ProgrammaticPacingCampaignRow } from "@/lib/pacing/programmatic/types"
import type { AdServingPacingCampaignRow } from "@/lib/pacing/ad-serving/types"
import type { DirectCampaignGroup, DirectLineItemRow } from "@/lib/pacing/direct/types"
import {
  buildKpiComparisons,
  computeRowKpiStatus,
  type SingleKpiStatus,
} from "@/lib/pacing/kpi/computeKpiStatus"
import {
  buildSocialKpiComparisons,
  computeSocialRowKpiStatus,
} from "@/lib/pacing/social/computeSocialKpiStatus"
import {
  buildProgrammaticKpiComparisons,
  computeProgrammaticRowKpiStatus,
} from "@/lib/pacing/programmatic/computeProgrammaticKpiStatus"
import { labelForMetric } from "@/lib/pacing/kpi/formatKpi"
import { slugifyPlanClientName } from "@/lib/pacing/scope/resolveClientSlugs"
import { computeDaysPassed } from "@/lib/pacing/maths"
import type { ChannelSpendMode } from "@/lib/pacing/portfolio/types"
import type { LineCardKpi, LineCardMetric, LineCardModel } from "./lineCardTypes"
import {
  burstMonthLabel,
  burstStates,
  lineDaysLeft,
  lineTimePct,
  perDayLeftForWindow,
  perDayPlanForWindow,
  projectLineFinish,
  resolveLinePace,
  resolveSourceState,
  spendVsExpectedPct,
} from "./lineCardPace"
import { burstWhyClause, lineWhySentence } from "./lineCardWhy"
import {
  formatCount,
  formatRateMoney,
  formatWholeMoney,
  kpiChip,
  ratioOrDash,
} from "./lineCardFormat"

function finite(n: number | null | undefined): number {
  return typeof n === "number" && Number.isFinite(n) ? n : 0
}

function daysElapsed(start: string | null | undefined, end: string | null | undefined, asOf: string): number {
  if (!start || !end) return 0
  return computeDaysPassed(start, end, asOf)
}

function comparisonToKpi(
  label: string,
  delivered: string,
  target: string,
  status: SingleKpiStatus,
  source: LineCardKpi["source"] = status === "no-target" ? null : "target",
): LineCardKpi {
  return kpiChip({ label, delivered, target, source, status })
}

function finishModel(base: Draft): LineCardModel {
  const daysLeft = lineDaysLeft(base.lineStart, base.lineEnd, base._asOf)
  const elapsed = daysElapsed(base.lineStart, base.lineEnd, base._asOf)
  const projected = projectLineFinish(base.spend, base.timePct)
  const burstClause = burstWhyClause({
    burstStart: base.burstStart,
    burstPct: base.burstPct,
    daysLeft: base.burstPct == null ? null : lineDaysLeft(base.burstStart, base._burstEnd, base._asOf),
  })
  const why = lineWhySentence({
    pace: base.pace,
    platform: base.platform,
    linePct: base.linePct,
    daysElapsed: elapsed,
    daysLeft,
    spend: base.spend,
    budget: base.budget,
    projectedFinish: projected,
    perDayLeft: base.perDayLeft,
    perDayPlan: base.perDayPlan,
    sourceState: base.sourceState,
    burstClause,
  })
  const { _asOf, _burstEnd, burstStart, ...model } = base
  void _asOf
  void _burstEnd
  void burstStart
  return { ...model, why }
}

type Draft = Omit<LineCardModel, "why"> & {
  _asOf: string
  burstStart: string | null
  _burstEnd: string | null
}

function spendDraft(input: {
  client: string
  campaignName: string
  mba: string
  lineItemId: string
  platform: string
  asOf: string
  start: string | null
  end: string | null
  targeting: string
  spend: number
  budget: number
  burstSpend: number | null
  burstBudget: number | null
  burstStart: string | null
  burstEnd: string | null
  yesterday: number
  currentBurstIndex: number | null
  totalBursts: number
  hasFactRows: boolean
  spendMode: ChannelSpendMode | null
  metrics: LineCardMetric[]
  kpis: LineCardKpi[]
  kpiStatus: LineCardModel["kpiStatus"]
  verificationOnly?: boolean
}): Draft {
  const timePct = lineTimePct(input.start, input.end, input.asOf)
  const burstTimePct =
    input.burstStart && input.burstEnd && input.burstBudget != null
      ? lineTimePct(input.burstStart, input.burstEnd, input.asOf)
      : 0
  const linePct = spendVsExpectedPct(input.spend, input.budget, timePct)
  const burstPct =
    input.burstSpend != null && input.burstBudget != null && input.burstStart
      ? spendVsExpectedPct(input.burstSpend, input.burstBudget, burstTimePct)
      : null
  const remainingLine = input.budget - input.spend
  const perDayLeft = perDayLeftForWindow(remainingLine, input.start, input.end, input.asOf)
  const perDayPlan = perDayPlanForWindow(input.budget, input.start, input.end)
  const inFlight = !input.start || input.asOf >= input.start
  const sourceState = resolveSourceState({
    start: input.start,
    asOf: input.asOf,
    hasFactRows: input.hasFactRows,
    inFlight,
  })
  const pace = resolveLinePace({
    timePct,
    linePct,
    spend: input.spend,
    budget: input.budget,
    start: input.start,
    asOf: input.asOf,
    hasFactRows: input.hasFactRows,
  })
  return {
    client: input.client,
    campaignName: input.campaignName,
    mba: input.mba,
    clientSlug: slugifyPlanClientName(input.client),
    lineItemId: input.lineItemId,
    platform: input.platform,
    pace,
    kpiStatus: input.kpiStatus,
    timePct,
    linePct,
    burstPct,
    spend: input.spend,
    budget: input.budget,
    burstSpend: input.burstSpend,
    burstBudget: input.burstBudget,
    remainingLine,
    perDayLeft,
    perDayPlan,
    yesterday: input.yesterday,
    metrics: input.metrics.slice(0, 4),
    kpis: input.kpis,
    bursts: burstStates(input.totalBursts, input.currentBurstIndex),
    lineStart: input.start,
    lineEnd: input.end,
    targeting: input.targeting,
    spendMode: input.spendMode,
    sourceState,
    burstMonth: burstMonthLabel(input.burstStart),
    verificationOnly: input.verificationOnly === true,
    _asOf: input.asOf,
    burstStart: input.burstStart,
    _burstEnd: input.burstEnd,
  }
}

export function lineCardFromSearch(row: SearchPacingCampaignRow, asOf: string): LineCardModel {
  const burst = row.currentBurst
  const kpis: LineCardKpi[] = buildKpiComparisons(row).map((cmp) =>
    comparisonToKpi(
      labelForMetric(cmp.metric),
      ratioOrDash(cmp.actual),
      ratioOrDash(cmp.target),
      cmp.status,
    ),
  )
  if (row.cpc != null) {
    kpis.push(
      kpiChip({
        label: "CPC",
        delivered: formatRateMoney(row.cpc),
        target: "",
        source: "rate",
        status: "no-target",
      }),
    )
  }
  const draft = spendDraft({
    client: row.clientName,
    campaignName: row.campaignName,
    mba: row.mbaNumber,
    lineItemId: row.lineItemId,
    platform: row.platform || "Google Ads",
    asOf,
    start: row.lineItemStartDate,
    end: row.lineItemEndDate,
    targeting: row.creativeTargeting,
    spend: finite(row.spendToDateLineTotal),
    budget: finite(row.totalLineItemBudget),
    burstSpend: burst ? finite(row.spendToDateCurrentBurst) : null,
    burstBudget: burst ? finite(burst.budget) : null,
    burstStart: burst?.startDate ?? null,
    burstEnd: burst?.endDate ?? null,
    yesterday: finite(row.spendYesterday),
    currentBurstIndex: row.currentBurstIndex,
    totalBursts: row.totalBursts,
    hasFactRows: row.impressions > 0 || row.clicks > 0 || row.spendToDateLineTotal > 0,
    spendMode: "actual",
    kpiStatus: computeRowKpiStatus(row),
    metrics: [
      { label: "Clicks", value: formatCount(row.clicks) },
      { label: "Conversions", value: formatCount(row.conversions) },
      { label: "CTR", value: ratioOrDash(row.ctr) },
      { label: "CPC", value: formatRateMoney(row.cpc) },
    ],
    kpis,
  })
  return finishModel(draft)
}

export function lineCardFromSocial(row: SocialPacingCampaignRow, asOf: string): LineCardModel {
  const burst = row.currentBurst
  const metrics: LineCardMetric[] = [
    { label: "Impressions", value: formatCount(row.impressions) },
    { label: "CTR", value: ratioOrDash(row.ctr) },
    { label: "CPM", value: row.impressions > 0 ? formatRateMoney((row.spend / row.impressions) * 1000) : "—" },
  ]
  if (row.videoViews > 0) {
    metrics.push({ label: "3s views", value: formatCount(row.videoViews) })
  }
  const kpis: LineCardKpi[] = buildSocialKpiComparisons(row).map((cmp) => {
    const delivered =
      cmp.metric === "cpv" ? formatRateMoney(cmp.actual) : ratioOrDash(cmp.actual)
    const target = cmp.metric === "cpv" ? formatRateMoney(cmp.target) : ratioOrDash(cmp.target)
    const label =
      cmp.metric === "conversionRate"
        ? "Conv. rate"
        : cmp.metric === "cpv"
          ? "CPV"
          : cmp.metric === "vtr"
            ? "VTR"
            : "CTR"
    return comparisonToKpi(label, delivered, target, cmp.status)
  })
  const draft = spendDraft({
    client: row.clientName,
    campaignName: row.campaignName,
    mba: row.mbaNumber,
    lineItemId: row.lineItemId,
    platform: row.platform || row.socialPlatform,
    asOf,
    start: row.lineItemStartDate,
    end: row.lineItemEndDate,
    targeting: row.creativeTargeting,
    spend: finite(row.spendToDateLineTotal),
    budget: finite(row.totalLineItemBudget),
    burstSpend: burst ? finite(row.spendToDateCurrentBurst) : null,
    burstBudget: burst ? finite(burst.budget) : null,
    burstStart: burst?.startDate ?? null,
    burstEnd: burst?.endDate ?? null,
    yesterday: finite(row.spendYesterday),
    currentBurstIndex: row.currentBurstIndex,
    totalBursts: row.totalBursts,
    hasFactRows: row.impressions > 0 || row.spendToDateLineTotal > 0,
    spendMode: "actual",
    kpiStatus: computeSocialRowKpiStatus(row),
    metrics,
    kpis,
  })
  return finishModel(draft)
}

function programmaticSpendMode(row: ProgrammaticPacingCampaignRow): ChannelSpendMode {
  if (row.spendPacingDeferredToDirect || row.fixedCostMedia) return "reported"
  return "actual"
}

export function lineCardFromProgrammatic(
  row: ProgrammaticPacingCampaignRow,
  asOf: string,
): LineCardModel {
  const burst = row.currentBurst
  const isVideo = row.videoViews > 0 || row.deliverableMetric === "VIDEO_3S_VIEWS"
  const metrics: LineCardMetric[] = isVideo
    ? [
        { label: "Views", value: formatCount(row.videoViews) },
        { label: "CPV", value: formatRateMoney(row.cpv) },
        { label: "VTR", value: ratioOrDash(row.vtr) },
        { label: "Spend mode", value: programmaticSpendMode(row) },
      ]
    : [
        { label: "Impressions", value: formatCount(row.impressions) },
        { label: "CPM", value: formatRateMoney(row.cpm) },
        { label: "VTR", value: ratioOrDash(row.vtr) },
        { label: "Spend mode", value: programmaticSpendMode(row) },
      ]
  const kpis: LineCardKpi[] = buildProgrammaticKpiComparisons(row).map((cmp) => {
    const delivered =
      cmp.metric === "cpv" ? formatRateMoney(cmp.actual) : ratioOrDash(cmp.actual)
    const target = cmp.metric === "cpv" ? formatRateMoney(cmp.target) : ratioOrDash(cmp.target)
    const label =
      cmp.metric === "conversionRate"
        ? "Conv. rate"
        : cmp.metric === "cpv"
          ? "CPV"
          : cmp.metric === "vtr"
            ? "VTR"
            : "CTR"
    return comparisonToKpi(label, delivered, target, cmp.status)
  })
  const draft = spendDraft({
    client: row.clientName,
    campaignName: row.campaignName,
    mba: row.mbaNumber,
    lineItemId: row.lineItemId,
    platform: row.platformLabel || row.platform,
    asOf,
    start: row.lineItemStartDate,
    end: row.lineItemEndDate,
    targeting: row.creativeTargeting,
    spend: finite(row.spendToDateLineTotal),
    budget: finite(row.totalLineItemBudget),
    burstSpend: burst ? finite(row.spendToDateCurrentBurst) : null,
    burstBudget: burst ? finite(burst.budget) : null,
    burstStart: burst?.startDate ?? null,
    burstEnd: burst?.endDate ?? null,
    yesterday: finite(row.spendYesterday),
    currentBurstIndex: row.currentBurstIndex,
    totalBursts: row.totalBursts,
    hasFactRows: row.impressions > 0 || row.videoViews > 0 || row.spendToDateLineTotal > 0,
    spendMode: programmaticSpendMode(row),
    kpiStatus: computeProgrammaticRowKpiStatus(row),
    metrics,
    kpis,
  })
  return finishModel(draft)
}

export function lineCardFromAdServing(
  row: AdServingPacingCampaignRow,
  asOf: string,
): LineCardModel {
  const start = row.lineItemStartDate
  const end = row.lineItemEndDate
  const timePct = lineTimePct(start, end, asOf)
  const delivered = row.deliverableKind === "clicks" ? row.clicks : row.impressions
  const planned = row.deliverableTarget
  const linePct = spendVsExpectedPct(delivered, planned, timePct)
  const burst = row.currentBurst
  const burstTarget = burst?.calculatedValue ?? null
  const burstPct =
    burst && burstTarget != null && burstTarget > 0
      ? spendVsExpectedPct(delivered, burstTarget, lineTimePct(burst.startDate, burst.endDate, asOf))
      : null
  const hasFactRows = row.impressions > 0 || row.clicks > 0
  const pace = resolveLinePace({
    timePct,
    linePct,
    spend: delivered,
    budget: planned,
    start,
    asOf,
    hasFactRows,
  })
  const sourceState = resolveSourceState({
    start,
    asOf,
    hasFactRows,
    inFlight: !start || asOf >= start,
  })
  const remainingLine = Math.max(0, planned - delivered)
  const draft: Draft = {
    client: row.clientName,
    campaignName: row.campaignName,
    mba: row.mbaNumber,
    clientSlug: slugifyPlanClientName(row.clientName),
    lineItemId: row.lineItemId,
    platform: row.platform || "CM360",
    pace,
    kpiStatus: null,
    timePct,
    linePct,
    burstPct,
    spend: 0,
    budget: 0,
    burstSpend: null,
    burstBudget: null,
    remainingLine,
    perDayLeft: perDayLeftForWindow(remainingLine, start, end, asOf),
    perDayPlan: perDayPlanForWindow(planned, start, end),
    yesterday: 0,
    metrics: [
      { label: "Served impressions", value: formatCount(row.impressions) },
      { label: "Clicks", value: formatCount(row.clicks) },
      { label: "CTR", value: ratioOrDash(row.ctr) },
      { label: "Video completes", value: formatCount(row.videoCompletes) },
    ],
    kpis: [
      kpiChip({
        label: "Verification only",
        delivered: "CM360",
        target: "",
        source: null,
        status: null,
      }),
    ],
    bursts: burstStates(row.totalBursts, row.currentBurstIndex),
    lineStart: start,
    lineEnd: end,
    targeting: row.creativeTargeting,
    spendMode: null,
    sourceState,
    burstMonth: burstMonthLabel(burst?.startDate),
    verificationOnly: true,
    _asOf: asOf,
    burstStart: burst?.startDate ?? null,
    _burstEnd: burst?.endDate ?? null,
  }
  return finishModel(draft)
}

function directCurrentBurst(line: DirectLineItemRow): DirectLineItemRow["bursts"][number] | null {
  return (
    line.bursts.find((burst) => burst.status === "in_progress") ??
    line.bursts.find((burst) => burst.status.startsWith("completed")) ??
    null
  )
}

export function lineCardFromDirect(
  group: DirectCampaignGroup,
  line: DirectLineItemRow,
  asOf: string,
): LineCardModel {
  const burst = directCurrentBurst(line)
  const currentIndex = burst ? line.bursts.findIndex((item) => item.burstIndex === burst.burstIndex) : null
  const start = line.bursts[0]?.startDate ?? group.campaignStartDate
  const end = line.bursts.at(-1)?.endDate ?? group.campaignEndDate
  const draft = spendDraft({
    client: group.clientName,
    campaignName: group.campaignName,
    mba: group.mbaNumber,
    lineItemId: line.lineItemId,
    platform: line.buyType || "Direct",
    asOf,
    start,
    end,
    targeting: line.lineItemName,
    spend: finite(line.totalReported),
    budget: finite(line.totalBudget),
    burstSpend: burst ? finite(burst.reportedSpend) : null,
    burstBudget: burst ? finite(burst.budget) : null,
    burstStart: burst?.startDate ?? null,
    burstEnd: burst?.endDate ?? null,
    yesterday: 0,
    currentBurstIndex: currentIndex != null && currentIndex >= 0 ? currentIndex : null,
    totalBursts: line.burstCount || line.bursts.length,
    hasFactRows: line.totalReported > 0 || line.totalActual > 0,
    spendMode: "reported",
    kpiStatus: null,
    metrics: [
      { label: "Reported", value: formatWholeMoney(line.totalReported) },
      { label: "Actual platform", value: formatWholeMoney(line.totalActual) },
      { label: "Buy type", value: line.buyType || "—" },
      { label: "Variance", value: formatWholeMoney(line.variance) },
    ],
    kpis: [],
  })
  return finishModel(draft)
}

export function lineCardsFromDirectGroup(
  group: DirectCampaignGroup,
  asOf: string,
): LineCardModel[] {
  return group.lineItems.map((line) => lineCardFromDirect(group, line, asOf))
}
