import type { LineCardModel } from "@/lib/pacing/channel/lineCardTypes"
import { lineDaysLeft } from "@/lib/pacing/channel/lineCardPace"
import { computeCampaignDays, computeDaysPassed } from "@/lib/pacing/maths"
import type { ScenarioDeliverable, ScenarioLine, ScenarioRate } from "./types.js"

function buyKind(buyType: string | null): ScenarioRate["kind"] | null {
  const raw = (buyType ?? "").trim().toLowerCase()
  if (raw === "cpc") return "cpc"
  if (raw === "cpm") return "cpm"
  if (raw === "cpv") return "cpv"
  if (raw === "cpa") return "cpa"
  return null
}

function rateFromCard(model: LineCardModel): ScenarioRate | null {
  const kind = buyKind(model.buyType)
  const delivered = model.spend > 0
  if ((kind === "cpc" || model.cpc != null) && model.cpc != null && model.cpc > 0) {
    return { kind: "cpc", value: model.cpc, basis: delivered && (model.clicks ?? 0) > 0 ? "delivered" : "plan" }
  }
  if ((kind === "cpm" || model.cpm != null) && model.cpm != null && model.cpm > 0) {
    return {
      kind: "cpm",
      value: model.cpm,
      basis: delivered && (model.impressions ?? 0) > 0 ? "delivered" : "plan",
    }
  }
  if (model.views != null && model.views > 0 && model.spend > 0) {
    return { kind: "cpv", value: model.spend / model.views, basis: "delivered" }
  }
  if (model.conversions != null && model.conversions > 0 && model.spend > 0) {
    return { kind: "cpa", value: model.spend / model.conversions, basis: "delivered" }
  }
  return null
}

function plannedFromRate(budget: number, rate: ScenarioRate | null): number | null {
  if (!rate || !(rate.value > 0) || !(budget > 0)) return null
  if (rate.kind === "cpm") return budget / rate.value * 1_000
  return budget / rate.value
}

function deliverableFromCard(model: LineCardModel, rate: ScenarioRate | null): ScenarioDeliverable | null {
  if (rate?.kind === "cpc" || (model.clicks != null && model.clicks > 0)) {
    return {
      unit: "clicks",
      delivered: model.clicks ?? 0,
      planned: plannedFromRate(model.budget, rate) ?? 0,
    }
  }
  if (rate?.kind === "cpv" || (model.views != null && model.views > 0)) {
    return {
      unit: "views",
      delivered: model.views ?? 0,
      planned: plannedFromRate(model.budget, rate) ?? 0,
    }
  }
  if (rate?.kind === "cpa" || (model.conversions != null && model.conversions > 0)) {
    return {
      unit: "conversions",
      delivered: model.conversions ?? 0,
      planned: plannedFromRate(model.budget, rate) ?? 0,
    }
  }
  if (rate?.kind === "cpm" || (model.impressions != null && model.impressions > 0)) {
    return {
      unit: "impressions",
      delivered: model.impressions ?? 0,
      planned: plannedFromRate(model.budget, rate) ?? 0,
    }
  }
  return null
}

export function scenarioLineFromCard(
  model: LineCardModel,
  asOf: string,
  expectedToDate?: number,
): ScenarioLine | null {
  if (model.verificationOnly) return null
  const rate = rateFromCard(model)
  const daysLeft = lineDaysLeft(model.lineStart, model.lineEnd, asOf)
  const daysElapsed =
    model.lineStart && model.lineEnd
      ? computeDaysPassed(model.lineStart, model.lineEnd, asOf)
      : 0
  const campaignDays =
    model.lineStart && model.lineEnd ? computeCampaignDays(model.lineStart, model.lineEnd) : 0
  const expected =
    expectedToDate != null && Number.isFinite(expectedToDate)
      ? expectedToDate
      : model.budget * (model.timePct / 100)
  return {
    lineItemId: model.lineItemId,
    channel: model.channel,
    platform: model.platform,
    budget: model.budget,
    spent: model.spend,
    expectedToDate: expected,
    daysLeft,
    daysElapsed,
    endDate: model.lineEnd ?? asOf,
    bursts:
      model.burstStart && model.burstEnd && model.burstBudget != null
        ? [
            {
              index: model.bursts.index ?? 0,
              start: model.burstStart,
              end: model.burstEnd,
              budget: model.burstBudget,
              spend: model.burstSpend ?? 0,
            },
          ]
        : [],
    deliverable: deliverableFromCard(model, rate),
    rate,
    yesterday: model.yesterday,
    dailyPlan: model.perDayPlan ?? (campaignDays > 0 ? model.budget / campaignDays : 0),
  }
}

export function scenarioLinesFromDetail(input: {
  lines: LineCardModel[]
  asOf: string
  expectedToDate?: number
}): ScenarioLine[] {
  const spendable = input.lines.filter((line) => !line.verificationOnly)
  const budgetSum = spendable.reduce((sum, line) => sum + line.budget, 0)
  return spendable.flatMap((line) => {
    const share =
      input.expectedToDate != null && budgetSum > 0
        ? input.expectedToDate * (line.budget / budgetSum)
        : undefined
    const mapped = scenarioLineFromCard(line, input.asOf, share)
    return mapped ? [mapped] : []
  })
}
