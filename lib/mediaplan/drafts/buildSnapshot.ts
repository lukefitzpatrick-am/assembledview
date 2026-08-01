import type { PlanDraftStateV1 } from "@/lib/mediaplan/drafts/types"

export type ChannelLineBag = Record<string, unknown[]>

export function buildPlanDraftSnapshot(args: {
  mbaNumber: string
  masterId: number | null
  baseVersionId: number | null
  formValues: Record<string, unknown>
  channels: ChannelLineBag
  tipBudgetCents?: number
  tipLineIds?: string[]
}): PlanDraftStateV1 {
  const channels = args.channels
  const lineIds: string[] = []
  let lineCount = 0
  for (const rows of Object.values(channels)) {
    for (const row of rows) {
      lineCount += 1
      const id = String(
        (row as { line_item_id?: string; lineItemId?: string }).line_item_id ??
          (row as { lineItemId?: string }).lineItemId ??
          ""
      )
      if (id) lineIds.push(id)
    }
  }
  const budgetCents = Math.round(Number(args.formValues.mp_campaignbudget ?? 0) * 100) || 0
  return {
    v: 1,
    mbaNumber: args.mbaNumber,
    masterId: args.masterId,
    baseVersionId: args.baseVersionId,
    formValues: args.formValues,
    channels,
    meta: {
      lineCount,
      budgetCents,
      tipBudgetCents: args.tipBudgetCents,
      tipLineIds: args.tipLineIds ?? lineIds,
    },
  }
}
