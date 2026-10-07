"use client"

import { isValid, parseISO } from "date-fns"
import { Download, FileText } from "lucide-react"

import { ClientMark } from "@/components/brand/EntityMark"
import {
  PAGE_HERO_PADDING,
  PageHeroTitleBlock,
} from "@/components/dashboard/PageHeroShell"
import { CampaignStatusBadge } from "@/components/campaign/CampaignStatusBadge"
import { Button } from "@/components/ui/button"
import { formatDateRange } from "@/lib/format/date"
import { formatMoneyCompact } from "@/lib/format/money"
import { cn } from "@/lib/utils"
import AdminDateRangeSelector from "@/app/dashboard/[slug]/[mba_number]/components/AdminDateRangeSelector"
import {
  AvaCampaignReadAction,
  AvaCampaignScenarioAction,
} from "@/components/ava/AvaSkillActionSets"

interface CampaignHeroBannerProps {
  campaign: {
    campaignName: string
    clientName: string
    brand?: string
    mbaNumber: string
    status: string
    startDate: string
    endDate: string
    budget: number
    planVersion?: string
    poNumber?: string
    clientContact?: string
  }
  /** @deprecated Client colour paints only ClientMark. */
  brandColour?: string
  daysRemaining: number
  onOpenDetails: () => void
  onDownload: () => void
  campaignStart?: string
  campaignEnd?: string
  onAskRead?: () => void
}

function parseCampaignDate(value: string): Date | null {
  if (!value?.trim()) return null
  const iso = parseISO(value)
  if (isValid(iso)) return iso
  const fallback = new Date(value)
  return isValid(fallback) ? fallback : null
}

function formatHeroDateRange(startDate: string, endDate: string): string {
  const start = parseCampaignDate(startDate)
  const end = parseCampaignDate(endDate)
  if (!start || !end) return "Date range unavailable"
  return formatDateRange(start, end)
}

function StatusBadge({
  status,
  startDate,
  endDate,
}: {
  status: string
  startDate: string
  endDate: string
}) {
  return <CampaignStatusBadge status={status} startDate={startDate} endDate={endDate} />
}

export default function CampaignHeroBanner({
  campaign,
  brandColour,
  daysRemaining,
  onOpenDetails,
  onDownload,
  campaignStart,
  campaignEnd,
  onAskRead,
}: CampaignHeroBannerProps) {
  const subtitle = campaign.brand ? `${campaign.clientName} • ${campaign.brand}` : campaign.clientName
  const budget = Number(campaign.budget ?? 0) || 0

  const detail = (
    <>
      <p className="flex items-center gap-2">
        <ClientMark name={campaign.clientName} colour={brandColour} size="sm" />
        <span>{subtitle}</span>
      </p>
      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        <span className="inline-flex items-center rounded-input border border-am-muted-on-black px-2 py-0.5 font-mono text-xs font-medium tabular-nums text-am-muted-on-black">
          {campaign.mbaNumber}
        </span>
        <StatusBadge
          status={campaign.status}
          startDate={campaign.startDate}
          endDate={campaign.endDate}
        />
      </div>
      <p>{formatHeroDateRange(campaign.startDate, campaign.endDate)}</p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span>Budget: {formatMoneyCompact(budget)}</span>
        <span aria-hidden className="text-am-muted-on-black">
          •
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 shrink-0 rounded-pill bg-am-muted-on-black" aria-hidden />
          Days remaining: {Math.max(0, Math.round(daysRemaining))}
        </span>
      </div>
    </>
  )

  return (
    <section className="relative w-full overflow-hidden rounded-frame bg-am-ink text-am-white">
      <div className={cn("relative z-10 flex min-h-[140px] flex-col md:flex-row md:items-start md:justify-between", PAGE_HERO_PADDING, "pr-28 sm:pr-32 md:pr-40 lg:pr-44")}>
        <PageHeroTitleBlock
          title={campaign.campaignName}
          detail={detail}
          brandColour={brandColour}
          punctuate={false}
          surface="ink"
        />

        <div className="absolute right-6 top-1/2 z-20 flex -translate-y-1/2 flex-col gap-2 md:right-7">
          <AdminDateRangeSelector
            campaignStart={campaignStart}
            campaignEnd={campaignEnd}
            variant="minimal"
            showPresets
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 min-w-[7.5rem] justify-center gap-2 rounded-pill border-am-muted-on-black bg-transparent text-xs font-medium text-am-white hover:bg-am-white/10 max-[375px]:h-11"
            onClick={onOpenDetails}
          >
            <FileText className="h-3.5 w-3.5" aria-hidden />
            View details
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 min-w-[7.5rem] justify-center gap-2 rounded-pill border-am-muted-on-black bg-transparent text-xs font-medium text-am-white hover:bg-am-white/10 max-[375px]:h-11"
            onClick={onDownload}
          >
            <Download className="h-3.5 w-3.5" aria-hidden />
            Downloads
          </Button>
          <AvaCampaignReadAction onActivate={onAskRead} />
          <AvaCampaignScenarioAction />
        </div>
      </div>
    </section>
  )
}
