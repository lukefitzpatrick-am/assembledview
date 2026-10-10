import { format } from "date-fns"

import { CAMPAIGN_PHASE } from "@/lib/design/status"
import { resolveCampaignPhase, type CampaignPhase } from "@/lib/mediaplan/campaignPhase"

export const CAMPAIGN_LIST_CHIPS = [
  "all",
  "live",
  "planned",
  "approved",
  "booked",
  "completed",
  "cancelled",
] as const

export type CampaignListChip = (typeof CAMPAIGN_LIST_CHIPS)[number]

export const CAMPAIGN_LIST_CHIP_LABEL: Record<CampaignListChip, string> = {
  all: "All",
  live: "Live",
  planned: "Planned",
  approved: "Approved",
  booked: "Booked",
  completed: "Completed",
  cancelled: "Cancelled",
}

export type CampaignListRow = {
  campaign_status?: unknown
  campaign_start_date?: string | null
  campaign_end_date?: string | null
  mp_client_name?: string | null
  mp_campaignname?: string | null
  campaign_name?: string | null
  mba_number?: string | null
  version_number?: number | null
  mp_campaignbudget?: number | null
}

/** Display phase only. Callers must not write this back onto campaign_status. */
export function campaignListPhase(row: CampaignListRow, today?: Date): CampaignPhase {
  return resolveCampaignPhase({
    status: row.campaign_status,
    startDate: row.campaign_start_date,
    endDate: row.campaign_end_date,
    today,
  }).phase
}

export function filterCampaignsByStatusChip<T extends CampaignListRow>(
  rows: readonly T[],
  chip: CampaignListChip,
  today?: Date,
): T[] {
  if (chip === "all") return [...rows]
  return rows.filter((row) => campaignListPhase(row, today) === chip)
}

function dayLabel(value: string | null | undefined): string {
  if (typeof value !== "string") return ""
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim())
  if (!match) return ""
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  if (Number.isNaN(date.getTime())) return ""
  return format(date, "d MMM yyyy")
}

export function formatCampaignDateRange(
  start: string | null | undefined,
  end: string | null | undefined,
): string {
  const startLabel = dayLabel(start)
  const endLabel = dayLabel(end)
  if (startLabel && endLabel) return `${startLabel} to ${endLabel}`
  return startLabel || endLabel || ""
}

export const CAMPAIGN_LIST_CSV_HEADERS = [
  "Campaign",
  "Client",
  "MBA",
  "Status",
  "Dates",
  "Media types",
  "Budget",
  "Version",
] as const

export function campaignListCsvRows<T extends CampaignListRow>(
  rows: readonly T[],
  options: {
    today?: Date
    mediaLabels: (row: T) => readonly string[]
    formatBudget: (amount: number | null | undefined) => string
  },
): string[][] {
  const body = rows.map((row) => {
    const phase = campaignListPhase(row, options.today)
    const name = (row.mp_campaignname || row.campaign_name || "").trim()
    return [
      name,
      (row.mp_client_name ?? "").trim(),
      (row.mba_number ?? "").trim(),
      CAMPAIGN_PHASE[phase].label,
      formatCampaignDateRange(row.campaign_start_date, row.campaign_end_date),
      options.mediaLabels(row).join("; "),
      options.formatBudget(row.mp_campaignbudget),
      row.version_number == null ? "" : String(row.version_number),
    ]
  })
  return [[...CAMPAIGN_LIST_CSV_HEADERS], ...body]
}

export function mediaPillWindow(
  labels: readonly string[],
  max = 3,
): { shown: string[]; extra: number } {
  const shown = labels.slice(0, max)
  return { shown, extra: Math.max(0, labels.length - shown.length) }
}
