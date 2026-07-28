/**
 * Plan C C3 — publish gate: booked/approved requires a billing schedule with line detail
 * when channel or production lines exist.
 *
 * Behind PLANC_C3_SCHEDULE_REQUIRED=off|log|enforce (default off).
 */

import type { BillingMonth } from "@/lib/billing/types"
import { parsePersistedBillingScheduleToMonths } from "@/lib/billing/parsePersistedBillingScheduleToMonths"
import type { LineItemInput } from "@/lib/finance/campaignFinancials.types"
import { MEDIA_TYPE_LABELS } from "@/lib/media/mediaTypes"
import { billingMonthsHaveDetailedLineItems } from "@/lib/mediaplan/partialMba"
import { normaliseScheduleMediaType } from "@/lib/finance/computeCampaignFinancials"

export const PLANC_C3_LOG_PREFIX = "[planc-c3]"
export const PLANC_C3_SCHEDULE_REQUIRED_CODE = "PLANC_C3_SCHEDULE_REQUIRED"

export type PlanCC3ScheduleRequiredMode = "off" | "log" | "enforce"

export type C3GateMeta = {
  mba_number?: string | number
  version?: string | number
}

const LIVE_PUBLISH_STATUSES = new Set(["booked", "approved"])

export function resolvePlanCC3ScheduleRequiredMode(
  raw: string | undefined = process.env.PLANC_C3_SCHEDULE_REQUIRED
): PlanCC3ScheduleRequiredMode {
  const v = String(raw ?? "")
    .trim()
    .toLowerCase()
  if (v === "log" || v === "enforce") return v
  return "off"
}

/** True when the target campaign status is booked or approved (case-insensitive). */
export function isC3PublishTargetStatus(status: string | undefined | null): boolean {
  if (!status) return false
  return LIVE_PUBLISH_STATUSES.has(status.trim().toLowerCase())
}

/**
 * Join channel display names for human copy:
 * "Radio" | "Radio and OOH" | "Radio, OOH and Search"
 */
export function formatChannelListForC3(labels: string[]): string {
  const unique = [...new Set(labels.map((l) => l.trim()).filter(Boolean))]
  if (unique.length === 0) return "Channels"
  if (unique.length === 1) return unique[0]!
  if (unique.length === 2) return `${unique[0]} and ${unique[1]}`
  return `${unique.slice(0, -1).join(", ")} and ${unique[unique.length - 1]}`
}

export function formatC3ScheduleRequiredUserMessage(channelLabels: string[]): string {
  return `${formatChannelListForC3(channelLabels)} have line items but no billing schedule was saved`
}

/** Map a line-item / schedule mediaType key to a planner-facing label. */
export function labelForMediaType(mediaType: string): string {
  const normalised = normaliseScheduleMediaType(mediaType)
  return (
    MEDIA_TYPE_LABELS[normalised] ||
    MEDIA_TYPE_LABELS[mediaType] ||
    mediaType.trim() ||
    "Channel"
  )
}

/**
 * Collect display labels for channels/production that have non-excluded line items.
 */
export function channelLabelsFromLineItems(
  lineItems: Array<Pick<LineItemInput, "mediaType" | "approval">> | null | undefined
): string[] {
  if (!lineItems?.length) return []
  const labels: string[] = []
  const seen = new Set<string>()
  for (const line of lineItems) {
    if (line.approval === "excluded") continue
    const raw = String(line.mediaType ?? "").trim()
    if (!raw) continue
    const label = labelForMediaType(raw)
    if (seen.has(label)) continue
    seen.add(label)
    labels.push(label)
  }
  return labels
}

/** Map Xano channel table name → planner label (Radio, OOH, …). */
const TABLE_TO_LABEL: Record<string, string> = {
  media_plan_television: "Television",
  media_plan_radio: "Radio",
  media_plan_newspaper: "Newspaper",
  media_plan_magazines: "Magazines",
  media_plan_ooh: "OOH",
  media_plan_cinema: "Cinema",
  media_plan_digi_display: "Digital Display",
  media_plan_digi_audio: "Digital Audio",
  media_plan_digi_video: "Digital Video",
  media_plan_digi_bvod: "BVOD",
  media_plan_integrations: "Integration",
  media_plan_search: "Search",
  media_plan_social: "Social Media",
  media_plan_prog_display: "Programmatic Display",
  media_plan_prog_video: "Programmatic Video",
  media_plan_prog_bvod: "Programmatic BVOD",
  media_plan_prog_audio: "Programmatic Audio",
  media_plan_prog_ooh: "Programmatic OOH",
  media_plan_influencers: "Influencers",
  media_plan_production: "Production",
}

export function labelForChannelTable(table: string): string {
  return TABLE_TO_LABEL[table] || table.replace(/^media_plan_/, "").replace(/_/g, " ")
}

export function channelLabelsFromTables(tables: Iterable<string>): string[] {
  const labels: string[] = []
  const seen = new Set<string>()
  for (const table of tables) {
    const label = labelForChannelTable(table)
    if (seen.has(label)) continue
    seen.add(label)
    labels.push(label)
  }
  return labels
}

export function scheduleHasLineDetail(billingSchedule: unknown): boolean {
  const months: BillingMonth[] =
    parsePersistedBillingScheduleToMonths(billingSchedule) ?? []
  return billingMonthsHaveDetailedLineItems(months)
}

export type C3ScheduleRequiredGateResult =
  | { mode: "off"; shouldReject: false }
  | { mode: "log"; shouldReject: false; wouldReject: boolean; userMessage: string }
  | {
      mode: "enforce"
      shouldReject: true
      status: 409
      body: {
        error: string
        code: typeof PLANC_C3_SCHEDULE_REQUIRED_CODE
        userMessage: string
        channels: string[]
      }
    }
  | { mode: "enforce"; shouldReject: false; wouldReject: false }

/**
 * Apply PLANC_C3_SCHEDULE_REQUIRED when publishing to booked/approved.
 * - off: no-op
 * - log: console structured line, never fail
 * - enforce: 409 when lines exist without billing schedule line detail
 */
export function applyC3ScheduleRequiredGate(args: {
  mode: PlanCC3ScheduleRequiredMode
  targetStatus: string | undefined | null
  billingSchedule: unknown
  channelLabels: string[]
  meta?: C3GateMeta
}): C3ScheduleRequiredGateResult {
  if (args.mode === "off") {
    return { mode: "off", shouldReject: false }
  }

  if (!isC3PublishTargetStatus(args.targetStatus)) {
    return args.mode === "log"
      ? { mode: "log", shouldReject: false, wouldReject: false, userMessage: "" }
      : { mode: "enforce", shouldReject: false, wouldReject: false }
  }

  if (!args.channelLabels.length) {
    return args.mode === "log"
      ? { mode: "log", shouldReject: false, wouldReject: false, userMessage: "" }
      : { mode: "enforce", shouldReject: false, wouldReject: false }
  }

  if (scheduleHasLineDetail(args.billingSchedule)) {
    return args.mode === "log"
      ? { mode: "log", shouldReject: false, wouldReject: false, userMessage: "" }
      : { mode: "enforce", shouldReject: false, wouldReject: false }
  }

  const userMessage = formatC3ScheduleRequiredUserMessage(args.channelLabels)

  if (args.mode === "log") {
    console.log(
      PLANC_C3_LOG_PREFIX,
      JSON.stringify({
        mba_number: args.meta?.mba_number ?? null,
        version: args.meta?.version ?? null,
        targetStatus: args.targetStatus ?? null,
        channels: args.channelLabels,
        userMessage,
      })
    )
    return { mode: "log", shouldReject: false, wouldReject: true, userMessage }
  }

  return {
    mode: "enforce",
    shouldReject: true,
    status: 409,
    body: {
      error: userMessage,
      code: PLANC_C3_SCHEDULE_REQUIRED_CODE,
      userMessage,
      channels: args.channelLabels,
    },
  }
}
