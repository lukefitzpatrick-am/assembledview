"use client"

import { format, isValid, parseISO } from "date-fns"
import { Download, FileText } from "lucide-react"

import {
  PAGE_HERO_PADDING,
  PageHeroShell,
  PageHeroTitleBlock,
} from "@/components/dashboard/PageHeroShell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatCurrencyAUD } from "@/lib/format/currency"
import { cn } from "@/lib/utils"
import AdminDateRangeSelector from "@/app/dashboard/[slug]/[mba_number]/components/AdminDateRangeSelector"
import { AvaCampaignCommentaryAction } from "@/components/ava/AvaSkillActionSets"

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
  brandColour?: string
  daysRemaining: number
  onOpenDetails: () => void
  onDownload: () => void
  campaignStart?: string
  campaignEnd?: string
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
  return `${format(start, "dd MMM yyyy")} → ${format(end, "dd MMM yyyy")}`
}

type StatusKind = "booked" | "completed" | "draft" | "default"

function resolveStatusKind(status: string): StatusKind {
  const s = status.trim().toLowerCase()
  if (s.includes("booked") || s.includes("approved")) return "booked"
  if (s.includes("complete") || s.includes("closed")) return "completed"
  if (s.includes("draft")) return "draft"
  return "default"
}

function StatusBadge({ status }: { status: string }) {
  const kind = resolveStatusKind(status)
  const label = status.trim() || "—"

  if (kind === "booked") {
    return (
      <Badge className="border-0 bg-pacing-ahead-bg capitalize text-status-ahead-fg hover:bg-pacing-ahead-bg">
        {label}
      </Badge>
    )
  }
  if (kind === "completed") {
    return (
      <Badge variant="secondary" className="capitalize text-muted-foreground">
        {label}
      </Badge>
    )
  }
  if (kind === "draft") {
    return (
      <Badge variant="outline" className="capitalize">
        {label}
      </Badge>
    )
  }
  return (
    <Badge className="border-0 bg-pacing-on-track-bg capitalize text-status-on-track-fg hover:bg-pacing-on-track-bg">
      {label}
    </Badge>
  )
}

export default function CampaignHeroBanner({
  campaign,
  brandColour = "var(--pacing-on-track)",
  daysRemaining,
  onOpenDetails,
  onDownload,
  campaignStart,
  campaignEnd,
}: CampaignHeroBannerProps) {
  const subtitle = campaign.brand ? `${campaign.clientName} • ${campaign.brand}` : campaign.clientName
  const budget = Number(campaign.budget ?? 0) || 0

  const detail = (
    <>
      <p>{subtitle}</p>
      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        <span className="inline-flex items-center rounded-input border border-border bg-muted/35 px-2 py-0.5 font-mono text-xs font-medium tabular-nums text-muted-foreground">
          {campaign.mbaNumber}
        </span>
        <StatusBadge status={campaign.status} />
      </div>
      <p>{formatHeroDateRange(campaign.startDate, campaign.endDate)}</p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 shrink-0 rounded-pill" style={{ backgroundColor: brandColour }} aria-hidden />
          Budget: {formatCurrencyAUD(budget)}
        </span>
        <span aria-hidden className="text-border">
          •
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 shrink-0 rounded-pill bg-muted-foreground/70" aria-hidden />
          Days remaining: {Math.max(0, Math.round(daysRemaining))}
        </span>
      </div>
    </>
  )

  return (
    <PageHeroShell brandColour={brandColour} className={cn("animate-in fade-in-0 duration-500")}>
      <div className={cn("relative z-10 flex min-h-[140px] flex-col md:flex-row md:items-start md:justify-between", PAGE_HERO_PADDING, "pr-28 sm:pr-32 md:pr-40 lg:pr-44")}>
        <PageHeroTitleBlock title={campaign.campaignName} detail={detail} brandColour={brandColour} />

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
            className="h-9 min-w-[7.5rem] justify-center gap-2 rounded-pill border-border bg-card text-xs font-medium shadow-e0 transition-all hover:bg-muted max-[375px]:h-11"
            onClick={onOpenDetails}
          >
            <FileText className="h-3.5 w-3.5" aria-hidden />
            View details
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 min-w-[7.5rem] justify-center gap-2 rounded-pill border-border bg-card text-xs font-medium shadow-e0 transition-all hover:bg-muted max-[375px]:h-11"
            onClick={onDownload}
          >
            <Download className="h-3.5 w-3.5" aria-hidden />
            Downloads
          </Button>
          <AvaCampaignCommentaryAction />
        </div>
      </div>
    </PageHeroShell>
  )
}
