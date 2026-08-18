/**
 * Assemble THIS-CAMPAIGN report payload for a resolved period.
 * Numbers come from loadDeliverySnapshot (same source as on-page delivery).
 * KPI percent targets: omit ambiguous / non-decimal (N7 / AV-25) — never guess.
 */
import "server-only"

import { loadDeliverySnapshot } from "@/lib/delivery/loadDeliverySnapshot"
import type { DeliveryChannelGroup } from "@/lib/ava/tools/summaries"
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
import { computeExpectedPct, computeCampaignDays, computeDaysPassed, getAsOfDate } from "@/lib/pacing/maths"
import { formatReportInt, formatReportMoney } from "@/lib/reports/campaignReport/formatters"

export { formatReportInt, formatReportMoney }

const CHANNEL_LABELS: Record<string, string> = {
  social_meta: "Social (Meta)",
  social_tiktok: "Social (TikTok)",
  programmatic_display: "Programmatic display",
  programmatic_video: "Programmatic video",
  digital_display: "Digital Display",
  digital_video: "Digital Video",
  digital_audio: "Digital Audio",
  bvod: "BVOD",
  search: "Search",
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
  }
  channels: CampaignReportChannelRow[]
  kpis: CampaignReportKpiRow[]
  /** Fixed placeholder for the commentary slide (AVA wiring is follow-up). */
  commentaryPlaceholder: string
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

function firstTarget(
  rows: CampaignKPI[],
  metric: "ctr" | "cpv" | "conversion_rate" | "vtr" | "frequency",
): number | null {
  for (const row of rows) {
    const raw = row[metric]
    if (raw === null || raw === undefined) continue
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

  const [currentSnap, previousSnap, kpiRows] = await Promise.all([
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
  ])

  const prevByGroup = previousSnap ? indexChannels(previousSnap.channels) : new Map()
  const channels: CampaignReportChannelRow[] = currentSnap.channels.map((ch) => {
    const prev = prevByGroup.get(ch.group)
    return {
      group: ch.group,
      label: channelLabel(ch.group),
      plannedBudget: plannedBudgetOf(ch),
      spend: ch.totals.spendToDate,
      impressions: ch.totals.impressions,
      clicks: ch.totals.clicks,
      results: ch.totals.results,
      previousSpend: prev ? prev.totals.spendToDate : previousSnap ? 0 : null,
      previousImpressions: prev ? prev.totals.impressions : previousSnap ? 0 : null,
    }
  })

  const plannedBudget = typeof currentSnap.planTotals.plannedBudget === "number"
    ? currentSnap.planTotals.plannedBudget
    : channels.reduce((s, c) => s + c.plannedBudget, 0)

  const start = input.campaignStartISO ?? currentWindow.startISO
  const end = input.campaignEndISO ?? currentWindow.endISO
  const asOf = currentSnap.asOf || getAsOfDate()
  let expectedSpendToDate: number | null = null
  let timeElapsedPct: number | null = null
  if (start && end && plannedBudget > 0) {
    const campaignDays = computeCampaignDays(start, end)
    const daysPassed = computeDaysPassed(start, end, asOf)
    const expectedPct = computeExpectedPct(daysPassed, campaignDays)
    expectedSpendToDate = plannedBudget * expectedPct
    timeElapsedPct = expectedPct
  }

  const kpis = buildKpiRows(kpiRows, {
    impressions: currentSnap.planTotals.impressions,
    clicks: currentSnap.planTotals.clicks,
    results: currentSnap.planTotals.results,
    spend: currentSnap.planTotals.spendToDate,
  })

  return {
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
    },
    channels,
    kpis,
    commentaryPlaceholder:
      "PLACEHOLDER: insight commentary will be written by the assembled-insight-commentary skill after delivery review. Do not treat this slide as final client copy.",
  }
}
