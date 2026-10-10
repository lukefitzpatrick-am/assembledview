/**
 * Optional action / owner / outcome on a human insight.
 * outcome_kind matches campaign_insights_outcome_kind_check (0094):
 * null, "achieved", or "expected".
 */

export const INSIGHT_OUTCOME_KINDS = ["achieved", "expected"] as const

export type InsightOutcomeKind = (typeof INSIGHT_OUTCOME_KINDS)[number]

export type InsightActionFields = {
  action: string | null
  actionOwner: string | null
  outcome: string | null
  outcomeKind: InsightOutcomeKind | null
}

const ACTION_MAX = 2000
const OWNER_MAX = 200
const OUTCOME_MAX = 2000

export function parseInsightActionFields(input: {
  action?: unknown
  actionOwner?: unknown
  action_owner?: unknown
  outcome?: unknown
  outcomeKind?: unknown
  outcome_kind?: unknown
}): { ok: true; value: InsightActionFields } | { ok: false; message: string } {
  const action = readText(pick(input, "action"), "action", ACTION_MAX)
  if (!action.ok) return action
  const actionOwner = readText(
    pick(input, "actionOwner", "action_owner"),
    "action_owner",
    OWNER_MAX,
  )
  if (!actionOwner.ok) return actionOwner
  const outcome = readText(pick(input, "outcome"), "outcome", OUTCOME_MAX)
  if (!outcome.ok) return outcome
  const outcomeKind = readKind(pick(input, "outcomeKind", "outcome_kind"))
  if (!outcomeKind.ok) return outcomeKind
  return {
    ok: true,
    value: {
      action: action.value,
      actionOwner: actionOwner.value,
      outcome: outcome.value,
      outcomeKind: outcomeKind.value,
    },
  }
}

export type InsightCreatePayload = {
  clientId?: number
  mbaNumber?: string
  body: string
  insightType: string
  period: string | null
  action: string | null
  actionOwner: string | null
  outcome: string | null
  outcomeKind: InsightOutcomeKind | null
}

/** JSON body the record form POSTs to /api/insights. */
export function buildInsightCreatePayload(input: {
  clientId?: number | null
  mbaNumber?: string | null
  body: string
  insightType: string
  period?: string | null
  action?: string | null
  actionOwner?: string | null
  outcome?: string | null
  outcomeKind?: string | null
}): InsightCreatePayload {
  const parsed = parseInsightActionFields(input)
  const fields = parsed.ok
    ? parsed.value
    : { action: null, actionOwner: null, outcome: null, outcomeKind: null }
  const mba = input.mbaNumber?.trim().toLowerCase() || undefined
  const clientId =
    typeof input.clientId === "number" && Number.isFinite(input.clientId) && input.clientId > 0
      ? Math.floor(input.clientId)
      : undefined
  return {
    ...(clientId != null ? { clientId } : {}),
    ...(mba ? { mbaNumber: mba } : {}),
    body: input.body.trim(),
    insightType: input.insightType,
    period: input.period?.trim() || null,
    action: fields.action,
    actionOwner: fields.actionOwner,
    outcome: fields.outcome,
    outcomeKind: fields.outcomeKind,
  }
}

function pick(
  input: Record<string, unknown>,
  ...keys: string[]
): unknown {
  for (const key of keys) {
    if (key in input && input[key] !== undefined) return input[key]
  }
  return undefined
}

function readText(
  value: unknown,
  label: string,
  max: number,
): { ok: true; value: string | null } | { ok: false; message: string } {
  if (value == null || value === "") return { ok: true, value: null }
  if (typeof value !== "string") {
    return { ok: false, message: `${label} must be text when set` }
  }
  const text = value.replace(/\s+/g, " ").trim()
  if (!text) return { ok: true, value: null }
  if (text.length > max) {
    return { ok: false, message: `${label} must be ≤${max} characters` }
  }
  return { ok: true, value: text }
}

function readKind(
  value: unknown,
): { ok: true; value: InsightOutcomeKind | null } | { ok: false; message: string } {
  if (value == null || value === "") return { ok: true, value: null }
  if (value === "achieved" || value === "expected") return { ok: true, value }
  return {
    ok: false,
    message: "outcome_kind must be achieved or expected when set",
  }
}
