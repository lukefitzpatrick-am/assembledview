"use client"

import Image from "next/image"
import { BarChart3, DollarSign, FileText } from "lucide-react"

import {
  PAGE_HERO_PADDING,
  PageHeroShell,
  PageHeroTitleBlock,
} from "@/components/dashboard/PageHeroShell"
import { ClientProfileLinks } from "@/components/dashboard/ClientProfileLinks"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { formatCurrencyCompact } from "@/lib/format/currency"
import { cn } from "@/lib/utils"

export interface HeroBannerProps {
  clientName: string
  clientLogo?: string | null
  brandColour?: string
  totalSpend: number
  activeCampaigns: number
  averageRoas?: number
  performanceVsBenchmark?: number
  onOpenDetails: () => void
  onOpenFinance: () => void
  onOpenKPIs: () => void
  isAdmin?: boolean
  /** Client hub (/client/[slug]): omit benchmark line and Avg ROAS meta. */
  clientHubLayout?: boolean
  /** Raw Xano client row — used for profile link icons on admin hub. */
  clientRecord?: Record<string, unknown> | null
}

function getClientInitials(clientName: string): string {
  const parts = clientName.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
}

function formatRoas(value: number): string {
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value)}x`
}

function formatPercent(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
    minimumFractionDigits: Number.isInteger(value) ? 0 : 1,
  }).format(Math.abs(value))
}

function colorMix(color: string, percentage: number): string {
  return `color-mix(in srgb, ${color} ${percentage}%, transparent)`
}

export function HeroBanner({
  clientName,
  clientLogo,
  brandColour = "var(--pacing-on-track)",
  totalSpend,
  activeCampaigns,
  averageRoas,
  performanceVsBenchmark,
  onOpenDetails,
  onOpenFinance,
  onOpenKPIs,
  isAdmin = false,
  clientHubLayout = false,
  clientRecord = null,
}: HeroBannerProps) {
  const showBenchmarkLine = !clientHubLayout
  const showProfileLinks = clientHubLayout && isAdmin

  const detail = (
    <>
      {showBenchmarkLine && typeof performanceVsBenchmark === "number" ? (
        <p
          className={cn(
            "font-medium",
            performanceVsBenchmark >= 0 ? "text-status-ahead-fg" : "text-status-behind-fg",
          )}
        >
          Your campaigns are performing {formatPercent(performanceVsBenchmark)}%{" "}
          {performanceVsBenchmark >= 0 ? "above" : "below"} benchmark
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-pill" style={{ backgroundColor: brandColour }} aria-hidden />
          Total spend: {formatCurrencyCompact(totalSpend)}
        </span>
        <span aria-hidden className="text-border">
          •
        </span>
        <span>{activeCampaigns} active campaigns</span>
        {showBenchmarkLine && typeof averageRoas === "number" ? (
          <>
            <span aria-hidden className="text-border">
              •
            </span>
            <span>Avg ROAS: {formatRoas(averageRoas)}</span>
          </>
        ) : null}
      </div>
    </>
  )

  return (
    <PageHeroShell brandColour={brandColour}>
      <div
        className={cn(
          "relative z-10 flex w-full flex-col gap-5 md:flex-row md:items-start md:justify-between md:gap-8",
          PAGE_HERO_PADDING,
          isAdmin && "pr-14 sm:pr-16 md:pr-20",
        )}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
          <div className="relative h-14 w-14 shrink-0">
            <div
              className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-pill border border-border shadow-e1"
              style={clientLogo ? undefined : { borderColor: colorMix(brandColour, 30) }}
            >
              {clientLogo ? (
                <Image
                  src={clientLogo}
                  alt={`${clientName} logo`}
                  fill
                  className="object-cover"
                  sizes="56px"
                />
              ) : (
                <span
                  className="flex h-full w-full items-center justify-center text-base font-semibold text-primary-foreground"
                  style={{ backgroundColor: brandColour }}
                  aria-label={`${clientName} initials`}
                >
                  {getClientInitials(clientName)}
                </span>
              )}
            </div>
            <span
              className="absolute bottom-px right-px h-[10px] w-[10px] rounded-pill bg-accent shadow-e0"
              aria-hidden
            />
          </div>

          <PageHeroTitleBlock
            title={`Welcome back, ${clientName}`}
            detail={detail}
            brandColour={brandColour}
          />
        </div>
      </div>

      {showProfileLinks ? (
        <div className={cn("relative z-10 mt-4", PAGE_HERO_PADDING, isAdmin && "pr-14 sm:pr-16 md:pr-20")}>
          <ClientProfileLinks record={clientRecord} />
        </div>
      ) : null}

      {isAdmin ? (
        <div className="absolute right-3 top-1/2 z-20 -translate-y-1/2 sm:right-4 md:right-6 lg:right-7">
          <TooltipProvider delayDuration={100}>
            <div className="flex flex-col gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={onOpenDetails}
                    title="Client details"
                    aria-label="Client details"
                    className="interactive flex h-10 w-10 items-center justify-center rounded-pill border border-border bg-card text-muted-foreground shadow-e0 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <FileText className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="left">Client details</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={onOpenFinance}
                    title="Finance overview"
                    aria-label="Finance overview"
                    className="interactive flex h-10 w-10 items-center justify-center rounded-pill border border-border bg-card text-muted-foreground shadow-e0 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <DollarSign className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="left">Finance overview</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={onOpenKPIs}
                    title="KPIs & requirements"
                    aria-label="KPIs and publisher requirements"
                    className="interactive flex h-10 w-10 items-center justify-center rounded-pill border border-border bg-card text-muted-foreground shadow-e0 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <BarChart3 className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="left">KPIs & requirements</TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        </div>
      ) : null}
    </PageHeroShell>
  )
}
