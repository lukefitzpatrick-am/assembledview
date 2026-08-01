"use client"

import Image from "next/image"
import { BarChart3, Brain, DollarSign, FileText } from "lucide-react"

import {
  PAGE_HERO_PADDING_COMPACT,
  PageHeroShell,
  PageHeroTitleBlock,
} from "@/components/dashboard/PageHeroShell"
import { ClientProfileLinks } from "@/components/dashboard/ClientProfileLinks"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { formatMoneyCompact, formatPercent } from "@/lib/format/money"
import { cn } from "@/lib/utils"

export interface HeroBannerProps {
  clientName: string
  clientLogo?: string | null
  brandColour?: string
  totalSpend: number
  /** Label for the `totalSpend` figure. Defaults to "Total spend"; callers pass "Planned to
   * date" when `totalSpend` is a planned (not delivered/actuals) figure — see
   * `lib/dashboard/plannedSpendConsistency.ts`. */
  spendLabel?: string
  activeCampaigns: number
  averageRoas?: number
  performanceVsBenchmark?: number
  onOpenDetails: () => void
  onOpenFinance: () => void
  onOpenKPIs: () => void
  /** Opens Client Brain slide-over (hub/admin rail — same gate as sibling icons). */
  onOpenBrain?: () => void
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
  return `${new Intl.NumberFormat("en-AU", { maximumFractionDigits: 2 }).format(value)}x`
}

function colorMix(color: string, percentage: number): string {
  return `color-mix(in srgb, ${color} ${percentage}%, transparent)`
}

const heroIconButtonClassName =
  "interactive flex h-9 w-9 items-center justify-center rounded-pill border border-border bg-card text-muted-foreground shadow-e0 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"

export function HeroBanner({
  clientName,
  clientLogo,
  brandColour = "var(--pacing-on-track)",
  totalSpend,
  spendLabel = "Total spend",
  activeCampaigns,
  averageRoas,
  performanceVsBenchmark,
  onOpenDetails,
  onOpenFinance,
  onOpenKPIs,
  onOpenBrain,
  isAdmin = false,
  clientHubLayout = false,
  clientRecord = null,
}: HeroBannerProps) {
  const showBenchmarkLine = !clientHubLayout
  const showProfileLinks = clientHubLayout && isAdmin
  const showBrainIcon = Boolean(isAdmin && onOpenBrain && clientHubLayout)
  const showAdminRail = isAdmin

  const detail = (
    <>
      {showBenchmarkLine && typeof performanceVsBenchmark === "number" ? (
        <p
          className={cn(
            "font-medium",
            performanceVsBenchmark >= 0 ? "text-status-ahead-fg" : "text-status-behind-fg",
          )}
        >
          Your campaigns are performing {formatPercent(Math.abs(performanceVsBenchmark))}{" "}
          {performanceVsBenchmark >= 0 ? "above" : "below"} benchmark
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-pill" style={{ backgroundColor: brandColour }} aria-hidden />
          {spendLabel}: {formatMoneyCompact(totalSpend)}
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
          "relative z-10 flex w-full flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-6",
          PAGE_HERO_PADDING_COMPACT,
          showAdminRail && "pr-[5.75rem] sm:pr-[6.25rem]",
        )}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          <div className="relative h-12 w-12 shrink-0">
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
                  sizes="48px"
                />
              ) : (
                <span
                  className="flex h-full w-full items-center justify-center text-sm font-semibold text-primary-foreground"
                  style={{ backgroundColor: brandColour }}
                  aria-label={`${clientName} initials`}
                >
                  {getClientInitials(clientName)}
                </span>
              )}
            </div>
            <span
              className="absolute bottom-px right-px h-2 w-2 rounded-pill bg-accent shadow-e0"
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
        <div
          className={cn(
            "relative z-10 border-t border-border/50 pt-3",
            PAGE_HERO_PADDING_COMPACT,
            "pt-3",
            showAdminRail && "pr-[5.75rem] sm:pr-[6.25rem]",
          )}
        >
          <ClientProfileLinks record={clientRecord} />
        </div>
      ) : null}

      {showAdminRail ? (
        <div className="absolute right-3 top-1/2 z-20 -translate-y-1/2 sm:right-4 md:right-5">
          <TooltipProvider delayDuration={100}>
            {/* 2×2 grid — shorter than the old vertical stack so the hero can compress. */}
            <div
              className="grid grid-cols-2 gap-1.5"
              role="toolbar"
              aria-label="Client slide-overs"
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={onOpenDetails}
                    title="Client details"
                    aria-label="Client details"
                    className={heroIconButtonClassName}
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
                    className={heroIconButtonClassName}
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
                    className={heroIconButtonClassName}
                  >
                    <BarChart3 className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="left">KPIs & requirements</TooltipContent>
              </Tooltip>

              {showBrainIcon ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={onOpenBrain}
                      title="Client Brain"
                      aria-label="Client Brain"
                      className={heroIconButtonClassName}
                    >
                      <Brain className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="left">Client Brain</TooltipContent>
                </Tooltip>
              ) : (
                <span className="h-9 w-9" aria-hidden />
              )}
            </div>
          </TooltipProvider>
        </div>
      ) : null}
    </PageHeroShell>
  )
}
