export type PlanDraftStateV1 = {
  v: 1
  mbaNumber: string
  masterId: number | null
  baseVersionId: number | null
  formValues: Record<string, unknown>
  channels: Record<string, unknown[]>
  meta: {
    lineCount: number
    budgetCents: number
    tipBudgetCents?: number
    tipLineIds?: string[]
  }
}

export type PlanWorkingDraftRow = {
  id: number
  masterId: number
  userId: string
  userLabel: string | null
  baseVersionId: number | null
  draftStateJson: PlanDraftStateV1
  updatedAt: string
}

export const PLAN_DRAFT_SCHEMA_VERSION = 1 as const
