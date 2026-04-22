"use client"

import { format, isValid, parseISO } from "date-fns"
import { Download, FileText } from "lucide-react"

import { AccentBar } from "@/components/ui/accent-bar"
import { AnimatedDotField } from "@/components/ui/animated-dot-field"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { WaveRibbon } from "@/components/ui/wave-ribbon"
import { formatCurrencyAUD } from "@/lib/format/currency"
import { cn, hexToRgba } from "@/lib/utils"

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
      <Badge className="border-0 bg-emerald-500/15 capitalize text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300">
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
    <Badge className="border-0 bg-blue-500/15 capitalize text-blue-700 hover:bg-blue-500/20 dark:text-blue-300">
      {label}
    </Badge>
  )
}

export default function CampaignHeroBanner({
  campaign,
  brandColour = "#4f8fcb",
  daysRemaining,
  onOpenDetails,
  onDownload,
}: CampaignHeroBannerProps) {
  const subtitle = campaign.brand
    ? `${campaign.clientName} • ${campaign.brand}`
    : campaign.clientName

  const budget = Number(campaign.budget ?? 0) || 0

  const washGradient = `linear-gradient(125deg, rgba(255,255,255,1) 0%, rgba(255,255,255,0.97) 35%, ${hexToRgba(brandColour, 0.1)} 55%, ${hexToRgba(brandColour, 0.2)} 100%)`

  return (
    <section
      className={cn(
        "relative min-h-[160px] w-full overflow-hidden rounded-2xl border border-border/50",
        "animate-in fade-in-0 duration-500",
      )}
    >
      <div className="absolute inset-0 z-0 bg-background" aria-hidden />
      <div
        className="absolute inset-0 z-0 dark:hidden"
        style={{ backgroundImage: washGradient }}
        aria-hidden
      />
      <div
        className="absolute inset-0 z-0 hidden dark:block"
        style={{
          backgroundImage: `linear-gradient(125deg, hsl(var(--background)) 0%, hsl(var(--background) / 0.97) 35%, ${hexToRgba(brandColour, 0.12)} 55%, ${hexToRgba(brandColour, 0.22)} 100%)`,
        }}
        aria-hidden
      />

      <WaveRibbon brandColour={brandColour} />
      <AnimatedDotField />

      <AccentBar brandColour={brandColour} className="absolute bottom-0 left-0 right-0 z-[2]" />

      <div className="relative z-10 min-h-[160px] pb-5 pl-6 pr-28 pt-6 sm:pr-32 md:pl-10 md:pr-40 lg:pr-44">
        <div className="min-w-0 space-y-2">
            <h1 className="text-2xl font-extrabold tracking-[-0.03em] text-foreground">
              {campaign.campaignName}
            </h1>
            <p className="text-sm text-muted-foreground">{subtitle}</p>

            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              <span className="inline-flex items-center rounded-md border border-border/60 bg-muted/35 px-2 py-0.5 font-mono text-xs font-medium tabular-nums text-muted-foreground">
                {campaign.mbaNumber}
              </span>
              <StatusBadge status={campaign.status} />
            </div>

            <p className="text-sm text-muted-foreground">{formatHeroDateRange(campaign.startDate, campaign.endDate)}</p>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: brandColour }}
                  aria-hidden
                />
                Budget: {formatCurrencyAUD(budget)}
              </span>
              <span aria-hidden className="text-border">
                •
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 shrink-0 rounded-full bg-muted-foreground/70" aria-hidden />
                Days remaining: {Math.max(0, Math.round(daysRemaining))}
              </span>
            </div>
        </div>

        <div className="absolute right-3 top-1/2 z-20 flex -translate-y-1/2 flex-col gap-2 sm:right-4 md:right-6">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 min-w-[7.5rem] justify-center gap-2 rounded-full border-border/60 bg-background/90 text-xs font-medium shadow-sm backdrop-blur-sm transition-all hover:scale-[1.02] hover:bg-muted"
            onClick={onOpenDetails}
          >
            <FileText className="h-3.5 w-3.5" aria-hidden />
            View details
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 min-w-[7.5rem] justify-center gap-2 rounded-full border-border/60 bg-background/90 text-xs font-medium shadow-sm backdrop-blur-sm transition-all hover:scale-[1.02] hover:bg-muted"
            onClick={onDownload}
          >
            <Download className="h-3.5 w-3.5" aria-hidden />
            Downloads
          </Button>
        </div>
      </div>

    </section>
  )
}
