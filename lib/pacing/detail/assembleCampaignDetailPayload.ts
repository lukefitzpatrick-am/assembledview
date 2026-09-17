import type { CampaignRead } from "@/lib/campaign-read/types"
import type { LineCardModel } from "@/lib/pacing/channel/lineCardTypes"
import type { CampaignPacingRow } from "@/lib/pacing/portfolio/types"
import { scenarioLinesFromDetail } from "@/lib/pacing/scenario/fromLineCard"
import { burstsFromLines } from "./burstsFromLines"
import { dailyFromFacts, type DailyFactPoint } from "./dailyFromFacts"
import { kpisFromLines } from "./kpisFromLines"
import type { CampaignDetailMetric, CampaignDetailNote, CampaignDetailPayload } from "./types"

const DAILY_METRICS: CampaignDetailMetric[] = ["spend", "impressions", "clicks", "views"]

export function assembleCampaignDetailPayload(input: {
  row: CampaignPacingRow
  lines: LineCardModel[]
  asOf: string
  read?: CampaignRead | null
  notes?: CampaignDetailNote[]
  dailyFacts?: DailyFactPoint[]
  planPerDayByChannel?: Record<string, number>
  clientId?: number | null
}): CampaignDetailPayload {
  const facts = input.dailyFacts ?? []
  const byMetric = Object.fromEntries(
    DAILY_METRICS.map((metric) => [
      metric,
      dailyFromFacts({
        facts,
        asOf: input.asOf,
        metric,
        planPerDayByChannel: input.planPerDayByChannel,
      }).series,
    ]),
  ) as CampaignDetailPayload["daily"]["byMetric"]
  return {
    row: input.row,
    lines: input.lines,
    kpis: kpisFromLines(input.lines),
    bursts: burstsFromLines(input.lines, input.asOf),
    daily: {
      series: byMetric.spend,
      metric: "spend",
      byMetric,
    },
    read: input.read ?? null,
    notes: input.notes ?? [],
    scenarioLines: scenarioLinesFromDetail({
      lines: input.lines,
      asOf: input.asOf,
      expectedToDate: input.row.expectedToDate,
    }),
    clientId: input.clientId ?? null,
  }
}
