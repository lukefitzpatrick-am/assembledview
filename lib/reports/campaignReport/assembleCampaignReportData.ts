/**
 * Assemble THIS-CAMPAIGN report payload for a resolved period.
 * Numbers come from loadDeliverySnapshot (same source as on-page delivery).
 * KPI percent targets: omit ambiguous / non-decimal (N7 / AV-25) — never guess.
 */
import "server-only"

import type { DeliveryState } from "@/lib/delivery/deliveryState"
import { loadDeliverySnapshot } from "@/lib/delivery/loadDeliverySnapshot"
import type { DeliveryChannelGroup, DeliveryLineSnapshot } from "@/lib/ava/tools/summaries"
import { readPlanVersionsByMba } from "@/lib/data/readMediaPlans"
import { fetchCampaignKpis } from "@/lib/kpi/campaignKpi"
import {
  classifyStoredKpiPercentForScan,
  formatStoredDecimalAsPercent,
  KPI_RATIO_PERCENT_METRICS,
} from "@/lib/kpi/percentUnits"
import { CLIENT_KPI_METRIC_LABELS, type CampaignKPI } from "@/lib/kpi/types"
import {
  clipWindowToCampaign,
  resolveCampaignReportPeriod,
  type CampaignReportPeriodKind,
  type ResolvedCampaignReportPeriod,
} from "@/lib/reports/campaignReport/periods"
import { computeCampaignDays, computeDaysPassed, computeExpectedPct, getAsOfDate } from "@/lib/pacing/maths"
import { formatReportInt, formatReportMoney } from "@/lib/reports/campaignReport/formatters"
import { generateReportCommentary } from "@/lib/reports/campaignReport/generateReportCommentary"
import {
  expectedMediaForReportWindow,
  reportPeriodIsSlice,
} from "@/lib/reports/campaignReport/expectedMedia"
import {
  expectedMediaAtElapsed,
  type CampaignReportPeriodMetrics,
} from "@/lib/reports/campaignReport/periodMetrics"
import { resolveMonthlySpendForPlan } from "@/lib/spend/monthlyPlanCalendar"
import {
  isBlankKpiTarget,
  rateMetricsFromLines,
  sumProratedDeliverable,
  type RateSourceLine,
} from "@/lib/reports/campaignReport/reportFigures"

export { formatReportInt, formatReportMoney }

const CHANNEL_LABELS: Record<string, string> = {
  social_meta: "Social (Meta)",
  social_tiktok: "Social (TikTok)",
  social_reddit: "Social (Reddit)",
  programmatic_display: "Programmatic display",
  programmatic_video: "Programmatic video",
  programmatic_ooh: "Programmatic OOH",
  digital_display: "Digital Display",
  digital_video: "Digital Video",
  digital_audio: "Digital Audio",
  bvod: "BVOD",
  search: "Search",
  plan_only: "Awaiting delivery",
}

export type CampaignReportChannelRow = {
  group: string
  label: string
  plannedBudget: number
  spend: number
  impressions: number
  clicks: number
  results: number
  /** Previous-period spend when available. */
  previousSpend: number | null
  previousImpressions: number | null
  metrics: CampaignReportPeriodMetrics
  /** Null when this report has no previous window. */
  previousMetrics: CampaignReportPeriodMetrics | null
  /** Plan deliverables in the selected window. Null when the plan has none. */
  plannedImpressions?: number | null
  plannedClicks?: number | null
  plannedViews?: number | null
}

export type ReportCommentary = {
  summary: string
  items: {
    insight: string
    action: string
    actionOwner: string
    outcome: string
    outcomeKind: "achieved" | "expected"
  }[]
  /** Photo id from the brand catalogue. Omitted when none fits. */
  coverPhotoId?: string
}

export type CampaignReportKpiRow = {
  metric: string
  label: string
  targetDisplay: string
  actualDisplay: string | null
  /** Omitted from deck when true (ambiguous unit). */
  omitted: boolean
  omitReason?: string
}

export type CampaignReportPayload = {
  mbaNumber: string
  clientName: string
  campaignName: string
  versionNumber: number | null
  asOf: string
  period: ResolvedCampaignReportPeriod
  /** Verbatim money / volume totals for the selected period. */
  totals: {
    plannedBudget: number
    spend: number
    impressions: number
    clicks: number
    results: number
    previousSpend: number | null
    previousImpressions: number | null
    expectedSpendToDate: number | null
    timeElapsedPct: number | null
    metrics: CampaignReportPeriodMetrics
    /** Null when this report has no previous window. */
    previousMetrics: CampaignReportPeriodMetrics | null
    /**
     * Spend on lines with neither impressions nor clicks.
     * The key-metrics footnote shows this only when it is above zero.
     */
    rateExcludedSpend?: number
  }
  channels: CampaignReportChannelRow[]
  /**
   * Delivery state of every plan line in the current window.
   * The headless generator skips a deck when every state is no_source or no_rows_yet.
   */
  deliveryStates?: DeliveryState[]
  kpis: CampaignReportKpiRow[]
  /** Null when commentary was not generated. The deck then shows the not-generated line. */
  commentary: ReportCommentary | null
  /** Optional brand-library photo for the cover picture placeholder. */
  coverPhotoId?: string | null
}

function channelLabel(group: string): string {
  return CHANNEL_LABELS[group] ?? group.replace(/_/g, " ")
}

function indexChannels(channels: DeliveryChannelGroup[]): Map<string, DeliveryChannelGroup> {
  return new Map(channels.map((c) => [c.group, c]))
}

function plannedBudgetOf(ch: DeliveryChannelGroup | undefined): number {
  const n = ch?.totals.plannedBudget
  return typeof n === "number" && Number.isFinite(n) ? n : 0
}

function linesForRates(lines: DeliveryLineSnapshot[]): RateSourceLine[] {
  return lines
    .filter((line) => line.deliveryState === "reported" || line.deliveryState === "spend_only")
    .map((line) => ({
      spend: line.spendToDate,
      impressions: line.deliveryState === "reported" ? line.impressions : 0,
      clicks: line.deliveryState === "reported" ? line.clicks : 0,
      views: line.deliveryState === "reported" ? line.video3sViews : 0,
    }))
}

function plannedCount(
  lines: DeliveryLineSnapshot[],
  key: "plannedImpressions" | "plannedClicks" | "plannedViews",
  flight: { startISO: string; endISO: string },
  period: { startISO: string; endISO: string },
): number | null {
  return sumProratedDeliverable(
    lines.map((line) => ({
      total: line[key] ?? null,
      lineStartISO: line.startDate,
      lineEndISO: line.endDate,
    })),
    flight,
    period,
  )
}

function firstTarget(
  rows: CampaignKPI[],
  metric: "ctr" | "cpv" | "conversion_rate" | "vtr" | "frequency",
): number | null {
  for (const row of rows) {
    const raw = row[metric]
    if (isBlankKpiTarget(raw)) continue
    const n = typeof raw === "number" ? raw : Number(raw)
    if (Number.isFinite(n)) return n
  }
  return null
}

function buildKpiRows(
  kpiRows: CampaignKPI[],
  feed: { impressions: number; clicks: number; results: number; spend: number },
): CampaignReportKpiRow[] {
  const ratioSet = new Set<string>(KPI_RATIO_PERCENT_METRICS)
  const metrics = ["ctr", "cpv", "conversion_rate", "vtr", "frequency"] as const
  const out: CampaignReportKpiRow[] = []

  for (const metric of metrics) {
    const target = firstTarget(kpiRows, metric)
    if (target === null) continue
    const label = CLIENT_KPI_METRIC_LABELS[metric] ?? metric

    if (ratioSet.has(metric)) {
      const scan = classifyStoredKpiPercentForScan(target)
      if (scan.ambiguous || scan.inferredUnit === "percent_points" || scan.inferredUnit === "anomalous") {
        out.push({
          metric,
          label,
          targetDisplay: "—",
          actualDisplay: null,
          omitted: true,
          omitReason: "Pending KPI data review",
        })
        continue
      }
    }

    let actual: number | null = null
    if (metric === "ctr" && feed.impressions > 0) {
      actual = feed.clicks / feed.impressions
    } else if (metric === "conversion_rate" && feed.clicks > 0) {
      actual = feed.results / feed.clicks
    }

    const targetDisplay = ratioSet.has(metric)
      ? formatStoredDecimalAsPercent(target)
      : metric === "cpv"
        ? formatReportMoney(target)
        : String(target)

    const actualDisplay =
      actual == null
        ? null
        : ratioSet.has(metric)
          ? formatStoredDecimalAsPercent(actual)
          : String(actual)

    out.push({
      metric,
      label,
      targetDisplay,
      actualDisplay,
      omitted: false,
    })
  }

  return out
}

export type AssembleCampaignReportInput = {
  mbaNumber: string
  clientName?: string | null
  campaignName?: string | null
  versionNumber?: number
  campaignStartISO?: string | null
  campaignEndISO?: string | null
  periodKind: CampaignReportPeriodKind
  customStartISO?: string | null
  customEndISO?: string | null
  mpSearchEnabled?: boolean
  todayISO?: string
  /** Tests inject a stub. The export route uses the AVA writer. */
  generateCommentary?: typeof generateReportCommentary
}

export async function assembleCampaignReportData(
  input: AssembleCampaignReportInput,
): Promise<CampaignReportPayload> {
  const mbaNumber = input.mbaNumber.trim()
  if (!mbaNumber) throw new Error("mbaNumber is required")

  const period = resolveCampaignReportPeriod({
    kind: input.periodKind,
    campaignStartISO: input.campaignStartISO,
    campaignEndISO: input.campaignEndISO,
    customStartISO: input.customStartISO,
    customEndISO: input.customEndISO,
    todayISO: input.todayISO,
  })

  const currentWindow = clipWindowToCampaign(
    period.current,
    input.campaignStartISO,
    input.campaignEndISO,
  )
  const previousWindow = period.previous
    ? clipWindowToCampaign(period.previous, input.campaignStartISO, input.campaignEndISO)
    : null

  const [currentSnap, previousSnap, kpiRows, versions] = await Promise.all([
    loadDeliverySnapshot({
      mbaNumber,
      versionNumber: input.versionNumber,
      startDate: currentWindow.startISO,
      endDate: currentWindow.endISO,
      mpSearchEnabled: input.mpSearchEnabled,
    }),
    previousWindow
      ? loadDeliverySnapshot({
          mbaNumber,
          versionNumber: input.versionNumber,
          startDate: previousWindow.startISO,
          endDate: previousWindow.endISO,
          mpSearchEnabled: input.mpSearchEnabled,
        }).catch(() => null)
      : Promise.resolve(null),
    input.versionNumber != null && Number.isFinite(input.versionNumber)
      ? fetchCampaignKpis(mbaNumber, input.versionNumber).catch(() => [] as CampaignKPI[])
      : Promise.resolve([] as CampaignKPI[]),
    readPlanVersionsByMba(mbaNumber).catch((err) => {
      console.error("[campaign-report] plan version schedules failed", {
        mbaNumber,
        error: err instanceof Error ? err.message : String(err),
      })
      return [] as Record<string, unknown>[]
    }),
  ])

  const prevByGroup = previousSnap ? indexChannels(previousSnap.channels) : new Map()
  const plannedBudget = typeof currentSnap.planTotals.plannedBudget === "number"
    ? currentSnap.planTotals.plannedBudget
    : currentSnap.channels.reduce((s, ch) => s + plannedBudgetOf(ch), 0)

  const start = input.campaignStartISO ?? currentWindow.startISO
  const end = input.campaignEndISO ?? currentWindow.endISO
  const asOf = currentSnap.asOf || getAsOfDate()
  const versionNumber = input.versionNumber ?? currentSnap.versionNumber
  const version =
    versions.find((row) => Number(row.version_number) === versionNumber) ??
    versions.find((row) => row.published_at)
  const deliverySchedule = version?.deliverySchedule
  const scheduleInput = {
    billingSchedule: version?.billingSchedule ?? null,
    deliverySchedule,
    monthlySpend: resolveMonthlySpendForPlan(undefined, undefined, deliverySchedule),
    campaignStartISO: start,
    campaignEndISO: end,
  }
  const periodSlice = reportPeriodIsSlice(period.kind)
  const expectedSpendToDate = expectedMediaForReportWindow({
    ...scheduleInput,
    windowStartISO: currentWindow.startISO,
    windowEndISO: currentWindow.endISO,
    periodSlice,
  })
  const previousExpectedSpend = previousWindow
    ? expectedMediaForReportWindow({
        ...scheduleInput,
        windowStartISO: previousWindow.startISO,
        windowEndISO: previousWindow.endISO,
        periodSlice: true,
      })
    : null
  const timeElapsedPct =
    start && end
      ? computeExpectedPct(
          computeDaysPassed(start, end, currentWindow.endISO),
          computeCampaignDays(start, end),
        )
      : null

  const flight = { startISO: start, endISO: end }
  const channels: CampaignReportChannelRow[] = currentSnap.channels.map((ch) => {
    const prev = prevByGroup.get(ch.group)
    const planned = plannedBudgetOf(ch)
    const rates = rateMetricsFromLines(
      linesForRates(ch.lines),
      expectedMediaAtElapsed(planned, timeElapsedPct),
    )
    const previousRates = previousSnap
      ? rateMetricsFromLines(
          prev ? linesForRates(prev.lines) : [],
          expectedMediaAtElapsed(
            planned,
            previousWindow && start && end
              ? computeExpectedPct(
                  computeDaysPassed(start, end, previousWindow.endISO),
                  computeCampaignDays(start, end),
                )
              : null,
          ),
        )
      : null
    return {
      group: ch.group,
      label: channelLabel(ch.group),
      plannedBudget: planned,
      spend: ch.totals.spendToDate,
      impressions: ch.totals.impressions,
      clicks: ch.totals.clicks,
      results: ch.totals.results,
      previousSpend: prev ? prev.totals.spendToDate : previousSnap ? 0 : null,
      previousImpressions: prev ? prev.totals.impressions : previousSnap ? 0 : null,
      plannedImpressions: plannedCount(ch.lines, "plannedImpressions", flight, currentWindow),
      plannedClicks: plannedCount(ch.lines, "plannedClicks", flight, currentWindow),
      plannedViews: plannedCount(ch.lines, "plannedViews", flight, currentWindow),
      metrics: rates.metrics,
      previousMetrics: previousRates?.metrics ?? null,
    }
  })

  const currentRates = rateMetricsFromLines(
    linesForRates(currentSnap.channels.flatMap((ch) => ch.lines)),
    expectedSpendToDate,
  )

  const kpis = buildKpiRows(kpiRows, {
    impressions: currentSnap.planTotals.impressions,
    clicks: currentSnap.planTotals.clicks,
    results: currentSnap.planTotals.results,
    spend: currentSnap.planTotals.spendToDate,
  })

  const reportData: CampaignReportPayload = {
    mbaNumber,
    clientName: (input.clientName ?? "").trim() || "Client",
    campaignName: (input.campaignName ?? "").trim() || mbaNumber,
    versionNumber: currentSnap.versionNumber,
    asOf,
    period: {
      ...period,
      current: currentWindow,
      previous: previousWindow,
    },
    totals: {
      plannedBudget,
      spend: currentSnap.planTotals.spendToDate,
      impressions: currentSnap.planTotals.impressions,
      clicks: currentSnap.planTotals.clicks,
      results: currentSnap.planTotals.results,
      previousSpend: previousSnap ? previousSnap.planTotals.spendToDate : null,
      previousImpressions: previousSnap ? previousSnap.planTotals.impressions : null,
      expectedSpendToDate,
      timeElapsedPct,
      metrics: currentRates.metrics,
      rateExcludedSpend: currentRates.excludedSpend,
      previousMetrics: previousSnap
        ? rateMetricsFromLines(
            linesForRates(previousSnap.channels.flatMap((ch) => ch.lines)),
            previousExpectedSpend,
          ).metrics
        : null,
    },
    channels,
    deliveryStates: currentSnap.channels.flatMap((ch) =>
      ch.lines.map((line) => line.deliveryState),
    ),
    kpis,
    commentary: null,
  }

  const writeCommentary = input.generateCommentary ?? generateReportCommentary
  try {
    reportData.commentary = await writeCommentary({
      mbaNumber,
      period: reportData.period,
      reportData,
    })
  } catch (err) {
    console.error("[campaign-report] commentary failed", {
      mbaNumber,
      error: err instanceof Error ? err.message : String(err),
    })
    reportData.commentary = null
  }

  return reportData
}
