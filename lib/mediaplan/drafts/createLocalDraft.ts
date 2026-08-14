import { draftAgeDays } from "@/lib/mediaplan/drafts/pill"
import type { PlanDraftStateV1 } from "@/lib/mediaplan/drafts/types"

/** Create-page IndexedDB drafts older than this are dropped on open. */
export const CREATE_LOCAL_DRAFT_MAX_AGE_DAYS = 14

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : String(value ?? "").trim()
}

export function countCreateDraftLines(state: PlanDraftStateV1): number {
  let n = 0
  for (const rows of Object.values(state.channels ?? {})) {
    if (Array.isArray(rows)) n += rows.length
  }
  if (n > 0) return n
  const meta = Number(state.meta?.lineCount ?? 0)
  return Number.isFinite(meta) && meta > 0 ? meta : 0
}

export function createDraftBudgetDollars(state: PlanDraftStateV1): number {
  const cents = Number(state.meta?.budgetCents ?? 0)
  if (Number.isFinite(cents) && cents > 0) return Math.round(cents / 100)
  const dollars = Number(state.formValues?.mp_campaignbudget ?? 0)
  return Number.isFinite(dollars) && dollars > 0 ? Math.round(dollars) : 0
}

/**
 * Create-page local draft is offered only when it holds real work.
 * Edit-page drafts (`masterId` set) never use this gate.
 */
export function isMeaningfulCreateDraft(state: PlanDraftStateV1): boolean {
  const fv = state.formValues ?? {}
  const client = str(fv.mp_client_name)
  const name = str(fv.mp_campaignname)
  const budget = Number(fv.mp_campaignbudget ?? 0)
  const budgetCents = Number(state.meta?.budgetCents ?? 0)
  return (
    Boolean(client) ||
    Boolean(name) ||
    (Number.isFinite(budget) && budget > 0) ||
    (Number.isFinite(budgetCents) && budgetCents > 0) ||
    countCreateDraftLines(state) > 0
  )
}

export function isCreateLocalDraftExpired(
  updatedAt: string,
  now: Date = new Date()
): boolean {
  return draftAgeDays(updatedAt, now) >= CREATE_LOCAL_DRAFT_MAX_AGE_DAYS
}

export function shouldOfferCreateLocalDraft(args: {
  state: PlanDraftStateV1
  updatedAt: string
  now?: Date
}): boolean {
  if (isCreateLocalDraftExpired(args.updatedAt, args.now ?? new Date())) {
    return false
  }
  return isMeaningfulCreateDraft(args.state)
}

export function summarizeCreateDraftOffer(state: PlanDraftStateV1): string {
  const fv = state.formValues ?? {}
  const client = str(fv.mp_client_name) || "No client"
  const name = str(fv.mp_campaignname) || "untitled"
  const lines = countCreateDraftLines(state)
  const dollars = createDraftBudgetDollars(state)
  const lineLabel = lines === 1 ? "1 line" : `${lines} lines`
  return `Unsaved campaign: ${client} — ${name}, ${lineLabel}, $${dollars}`
}
