import { Badge, type BadgeProps } from "@/components/ui/badge"
import {
  resolveCampaignPhase,
  type CampaignPhase,
} from "@/lib/mediaplan/campaignPhase"

const PHASE_LABEL: Record<CampaignPhase, string> = {
  planned: "Planned",
  approved: "Approved",
  booked: "Booked",
  live: "Live",
  completed: "Completed",
  cancelled: "Cancelled",
}

/** Booked = brand primary (list chrome). Live = ahead + dot — distinct from Booked. */
const PHASE_VARIANT: Record<CampaignPhase, NonNullable<BadgeProps["variant"]>> = {
  planned: "outline",
  approved: "info",
  booked: "default",
  live: "ahead",
  completed: "secondary",
  cancelled: "danger",
}

export function CampaignStatusBadge({
  status,
  startDate,
  endDate,
  today,
  className,
}: {
  status: unknown
  startDate?: string | null
  endDate?: string | null
  today?: Date
  className?: string
}) {
  const { phase } = resolveCampaignPhase({ status, startDate, endDate, today })

  return (
    <Badge
      variant={PHASE_VARIANT[phase]}
      size="sm"
      dot={phase === "live"}
      className={className}
    >
      {PHASE_LABEL[phase]}
    </Badge>
  )
}
