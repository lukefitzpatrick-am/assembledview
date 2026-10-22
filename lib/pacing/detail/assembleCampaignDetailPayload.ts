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
  /** View day. The daily chart runs to it. */
  asOf: string
  /**
   * Last day counted (P1). Bursts and the scenario lines stop here and only
   * read facts on or before it. Unset counts to `asOf`.
   */
  countTo?: string
  read?: CampaignRead | null
  notes?: CampaignDetailNote[]
  dailyFacts?: DailyFactPoint[]
  planPerDayByChannel?: Record<string, number>
  clientId?: number | null
  window?: CampaignDetailDailyWindow
}): CampaignDetailPayload {
  const facts = input.dailyFacts ?? []
  const countTo = input.countTo ?? input.asOf
  const countedFacts = input.countTo ? facts.filter((fact) => fact.date <= countTo) : facts
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
    bursts: burstsFromLines(input.lines, countTo, countedFacts),
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
      asOf: countTo,
      expectedToDate: input.row.expectedToDate,
    }),
    clientId: input.clientId ?? null,
    ...(input.countTo ? { countTo: input.countTo } : {}),
  }
}
