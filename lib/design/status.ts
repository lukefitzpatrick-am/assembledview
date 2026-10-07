import type { TaskPriority, TaskStatus } from "@/lib/codex/types"
import type { BillingState } from "@/lib/finance/billingLifecycle"
import type { DraftMatchOutcome } from "@/lib/finance/sections/draftMatch"
import type { CampaignPhase } from "@/lib/mediaplan/campaignPhase"
import type { RowKpiStatus } from "@/lib/pacing/kpi/computeKpiStatus"
import type { UiPacingStatus } from "@/lib/pacing/status"
import type { MatchStatus } from "@/lib/xero/matcher/threeTier"

export type Tone =
  | "outcome"
  | "insight"
  | "action"
  | "attention"
  | "critical"
  | "neutral"
  | "ink"
  | "cancelled"

export const TONE_DOT: Record<Tone, string> = {
  outcome: "bg-am-ink",
  insight: "bg-tone-insight",
  action: "bg-tone-action",
  attention: "bg-tone-attention",
  critical: "bg-tone-critical",
  neutral: "bg-tone-neutral",
  ink: "bg-tone-ink-fg",
  cancelled: "bg-tone-neutral",
}

export const TONE_TEXT: Record<Tone, string> = {
  outcome: "text-tone-outcome-fg",
  insight: "text-tone-insight-fg",
  action: "text-tone-action-fg",
  attention: "text-tone-attention-fg",
  critical: "text-tone-critical-fg",
  neutral: "text-muted-foreground",
  ink: "text-tone-ink-fg",
  cancelled: "text-muted-foreground",
}

export const PACING_UI_STATUS: Record<UiPacingStatus, { tone: Tone; label: string }> = {
  "on-track": { tone: "action", label: "On track" },
  ahead: { tone: "insight", label: "Ahead" },
  behind: { tone: "attention", label: "Behind" },
  "over-pacing": { tone: "attention", label: "Over-pacing" },
  "no-data": { tone: "neutral", label: "No data" },
  "kpi-pending": { tone: "neutral", label: "KPI pending" },
}

export const CAMPAIGN_PHASE: Record<CampaignPhase, { tone: Tone; label: string }> = {
  planned: { tone: "neutral", label: "Planned" },
  approved: { tone: "insight", label: "Approved" },
  booked: { tone: "action", label: "Booked" },
  live: { tone: "outcome", label: "Live" },
  completed: { tone: "ink", label: "Completed" },
  cancelled: { tone: "cancelled", label: "Cancelled" },
}

export const BILLING_STATE: Record<BillingState, { tone: Tone; label: string }> = {
  ready: { tone: "neutral", label: "Ready" },
  approved: { tone: "action", label: "Approved" },
  sent_to_finance: { tone: "action", label: "Sent to finance" },
  drafted: { tone: "insight", label: "Drafted" },
  issued: { tone: "ink", label: "Issued" },
  issued_outside_av: { tone: "ink", label: "Issued outside AV" },
  paid: { tone: "outcome", label: "Paid" },
  overdue: { tone: "critical", label: "Overdue" },
}

export const XERO_DRAFT_MATCH: Record<DraftMatchOutcome, { tone: Tone; label: string }> = {
  Agrees: { tone: "action", label: "Agrees" },
  Differs: { tone: "attention", label: "Differs" },
  Missing: { tone: "attention", label: "Missing" },
  Extra: { tone: "attention", label: "Extra" },
}

export const XERO_MATCH_STATUS: Record<MatchStatus, { tone: Tone; label: string }> = {
  matched: { tone: "action", label: "Matched" },
  diverged: { tone: "attention", label: "Diverged" },
  disputed: { tone: "critical", label: "Disputed" },
  written_off: { tone: "neutral", label: "Written off" },
}

export const CODEX_TASK_STATUS: Record<TaskStatus, { tone: Tone; label: string }> = {
  backlog: { tone: "neutral", label: "Backlog" },
  todo: { tone: "insight", label: "To do" },
  in_progress: { tone: "action", label: "In progress" },
  waiting: { tone: "attention", label: "Waiting" },
  done: { tone: "outcome", label: "Done" },
}

export const TASK_PRIORITY: Record<TaskPriority, { tone: Tone; label: string }> = {
  high: { tone: "attention", label: "High" },
  normal: { tone: "neutral", label: "Normal" },
  low: { tone: "neutral", label: "Low" },
}

/** Portfolio and channel count tiles. `live` has no tone and renders `text-foreground`. */
export const PACING_TILE: Record<
  "live" | "behind" | "on_track" | "ahead" | "over_pacing" | "attention" | "kpi_pending",
  { tone: Tone | null; label?: string }
> = {
  live: { tone: null, label: "Live" },
  behind: { tone: "attention", label: "Behind" },
  on_track: { tone: "action", label: "On track" },
  ahead: { tone: "insight", label: "Ahead" },
  over_pacing: { tone: "attention", label: "Over-pacing" },
  attention: { tone: "attention", label: "Needs attention" },
  kpi_pending: { tone: "neutral", label: "KPI pending" },
}

export const KPI_ROW_STATUS: Record<RowKpiStatus, { tone: Tone; label: string }> = {
  "kpi-on-track": { tone: "action", label: "KPIs on track" },
  "kpi-pending": { tone: "neutral", label: "KPI pending" },
  "kpi-mixed": { tone: "attention", label: "KPIs mixed" },
  "kpi-no-delivery": { tone: "critical", label: "No delivery" },
  "kpi-off-target": { tone: "critical", label: "KPIs off" },
}

/** Same 10 / 20 point bands as `pacingDeviationSparklineClass`. */
export function DEVIATION_TONE(absDeviationPoints: number): Tone {
  if (!Number.isFinite(absDeviationPoints) || absDeviationPoints <= 10) return "action"
  if (absDeviationPoints <= 20) return "attention"
  return "critical"
}

/** Live renders a pulsing dot. */
export const LIVE_PULSE = true
