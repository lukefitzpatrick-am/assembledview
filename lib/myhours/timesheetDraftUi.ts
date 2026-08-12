import type { TimeEntryProposalStatus } from "@/db/schema/myhours"

export type TimesheetDraftStatusMeta = {
  label: string
  variant: "secondary" | "success" | "outline" | "warning" | "blocking"
  blocked: boolean
  showMappingLink: boolean
}

const STATUS_META: Record<TimeEntryProposalStatus, TimesheetDraftStatusMeta> = {
  proposed: {
    label: "Proposed",
    variant: "secondary",
    blocked: false,
    showMappingLink: false,
  },
  confirmed: {
    label: "Confirmed",
    variant: "success",
    blocked: false,
    showMappingLink: false,
  },
  skipped: {
    label: "Skipped",
    variant: "outline",
    blocked: false,
    showMappingLink: false,
  },
  blocked_overlap: {
    label: "Blocked: overlap",
    variant: "warning",
    blocked: true,
    showMappingLink: false,
  },
  blocked_structure: {
    label: "Blocked: mapping",
    variant: "blocking",
    blocked: true,
    showMappingLink: true,
  },
}

export function timesheetDraftStatusMeta(
  status: TimeEntryProposalStatus
): TimesheetDraftStatusMeta {
  return STATUS_META[status]
}

export function formatTimesheetDuration(minutes: number): string {
  const safeMinutes = Math.max(0, Math.round(minutes))
  const hours = Math.floor(safeMinutes / 60)
  const remainingMinutes = safeMinutes % 60
  if (hours === 0) return `${remainingMinutes}m`
  if (remainingMinutes === 0) return `${hours}h`
  return `${hours}h ${remainingMinutes}m`
}
