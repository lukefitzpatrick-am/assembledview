import {
  mapEngineSplitToCreateTargets,
  type CreateTargetRow,
  type EngineSplitChannel,
} from "@/lib/planning/mapEngineSplitToCreateTargets"
import { roundMoney2 } from "@/lib/format/money"

export type RecommendedSplitV1 = {
  version: 1
  frozen_at: string
  bench_version: string
  engine_params_version?: string
  budget: number
  channels: EngineSplitChannel[]
  create_targets: CreateTargetRow[]
  campaign_budget: number
}

export function buildRecommendedSplitV1(args: {
  allocated: Array<{ engineChannelId: string; pct: number; dollars: number }>
  budget: number
  benchVersion: string
  engineParamsVersion?: string
  now?: Date
}): RecommendedSplitV1 {
  const channels: EngineSplitChannel[] = args.allocated.map((a) => ({
    engine_channel_id: a.engineChannelId,
    pct: a.pct,
    dollars: a.dollars,
  }))

  const budget = roundMoney2(args.budget)
  const mapped = mapEngineSplitToCreateTargets(channels, {
    campaignBudget: budget,
  })

  const snap: RecommendedSplitV1 = {
    version: 1,
    frozen_at: (args.now ?? new Date()).toISOString(),
    bench_version: args.benchVersion,
    budget,
    channels,
    create_targets: mapped.create_targets,
    campaign_budget: mapped.campaign_budget,
  }

  if (args.engineParamsVersion) {
    snap.engine_params_version = args.engineParamsVersion
  }

  return snap
}

export function isRecommendedSplitV1(value: unknown): value is RecommendedSplitV1 {
  if (!value || typeof value !== "object") return false
  const v = value as Record<string, unknown>
  return (
    v.version === 1 &&
    typeof v.frozen_at === "string" &&
    typeof v.bench_version === "string" &&
    typeof v.budget === "number" &&
    typeof v.campaign_budget === "number" &&
    Array.isArray(v.channels) &&
    Array.isArray(v.create_targets)
  )
}
