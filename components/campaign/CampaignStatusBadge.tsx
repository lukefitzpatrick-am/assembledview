import { StatusPill } from "@/components/ui/status-pill"
import { CAMPAIGN_PHASE } from "@/lib/design/status"
import { resolveCampaignPhase } from "@/lib/mediaplan/campaignPhase"

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
  const meta = CAMPAIGN_PHASE[phase]

  return (
    <StatusPill
      tone={meta.tone}
      label={meta.label}
      pulse={phase === "live"}
      size="sm"
      className={className}
    />
  )
}
