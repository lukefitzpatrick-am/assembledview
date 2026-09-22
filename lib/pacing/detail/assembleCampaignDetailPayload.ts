import type { CampaignRead } from "@/lib/campaign-read/types"
import type { LineCardModel } from "@/lib/pacing/channel/lineCardTypes"
import type { CampaignPacingRow } from "@/lib/pacing/portfolio/types"
import { scenarioLinesFromDetail } from "@/lib/pacing/scenario/fromLineCard"
import { burstsFromLines } from "./burstsFromLines"
import { dailyFromFacts, type DailyFactPoint } from "./dailyFromFacts"
import { kpisFromLines } from "./kpisFromLines"
import type {
  CampaignDetailDailyWindow,
  CampaignDetailMetric,
  CampaignDetailNote,
  CampaignDetailPayload,
} from "./types"

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
  window?: CampaignDetailDailyWindow
}): CampaignDetailPayload {
  const facts = input.dailyFacts ?? []
  const built = DAILY_METRICS.map((metric) =>
    dailyFromFacts({
      facts,
      asOf: input.asOf,
      metric,
      planPerDayByChannel: input.planPerDayByChannel,
      window: input.window,
    }),
  )
  const byMetric = Object.fromEntries(
    built.map((item) => [item.metric, item.series]),
  ) as CampaignDetailPayload["daily"]["byMetric"]
  const spend = built.find((item) => item.metric === "spend") ?? built[0]
  return {
    row: input.row,
    lines: input.lines,
    kpis: kpisFromLines(input.lines),
    bursts: burstsFromLines(input.lines, input.asOf, facts),
    daily: {
      series: spend?.series ?? [],
      metric: "spend",
      byMetric,
      table: spend?.table ?? [],
      empty: spend?.empty ?? true,
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
