"use client"

import Image from "next/image"
import { BarChart3, DollarSign, FileText } from "lucide-react"

import { PageHeroShell } from "@/components/dashboard/PageHeroShell"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { formatCurrencyCompact } from "@/lib/format/currency"
import { cn, hexToRgba } from "@/lib/utils"

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

export function HeroBanner({
  clientName,
  clientLogo,
  brandColour = "#4f8fcb",
  totalSpend,
  activeCampaigns,
  averageRoas,
  performanceVsBenchmark,
  onOpenDetails,
  onOpenFinance,
  onOpenKPIs,
  isAdmin = false,
  clientHubLayout = false,
}: HeroBannerProps) {
  const showBenchmarkLine = !clientHubLayout

  return (
    <PageHeroShell brandColour={brandColour}>
      <div className="relative z-10 pt-6 pr-6 pb-6 pl-14 md:pt-8 md:pr-8 md:pb-8 md:pl-14 lg:pt-8 lg:pr-8 lg:pb-8 lg:pl-14 xl:pt-10 xl:pr-10 xl:pb-10 xl:pl-14">
          <div
            className={cn(
              "flex w-full flex-col gap-6 md:flex-row md:items-center md:gap-8 xl:gap-10",
              isAdmin && "pr-14 sm:pr-16 md:pr-20"
            )}
          >
            {/* Logo with glow effect */}
            <div className="relative flex items-center gap-4">
              {/* Glow behind logo */}
              <div
                className="absolute -inset-2 rounded-full opacity-20 blur-xl"
                style={{ backgroundColor: brandColour }}
                aria-hidden
              />

              <div className="relative h-16 w-16 shrink-0">
                <div
                  className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-full border-2 shadow-lg"
                  style={{ borderColor: hexToRgba(brandColour, 0.3) }}
                >
                  {clientLogo ? (
                    <Image
                      src={clientLogo}
                      alt={`${clientName} logo`}
                      fill
                      className="object-cover"
                      sizes="64px"
                    />
                  ) : (
                    <span
                      className="flex h-full w-full items-center justify-center text-lg font-semibold text-white"
                      style={{ backgroundColor: brandColour }}
                      aria-label={`${clientName} initials`}
                    >
                      {getClientInitials(clientName)}
                    </span>
                  )}
                </div>
                <span
                  className="absolute bottom-px right-px h-[10px] w-[10px] rounded-full bg-[#C5D82D] shadow-[0_0_0_2px_rgb(255,255,255)]"
                  aria-hidden
                />
              </div>
            </div>

            {/* Welcome text */}
            <div className="flex min-w-0 flex-1 flex-col gap-2 xl:max-w-none">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl xl:text-4xl">
                Welcome back, {clientName}
              </h1>
              {showBenchmarkLine && typeof performanceVsBenchmark === "number" ? (
                <p
                  className={cn(
                    "text-sm font-medium md:text-base",
                    performanceVsBenchmark >= 0 ? "text-emerald-600" : "text-amber-600"
                  )}
                >
                  Your campaigns are performing {formatPercent(performanceVsBenchmark)}%{" "}
                  {performanceVsBenchmark >= 0 ? "above" : "below"} benchmark
                </p>
              ) : null}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: brandColour }} aria-hidden />
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
            </div>
          </div>
        </div>

        {/* Admin shortcut buttons - vertical stack on right */}
        {isAdmin && (
          <div className="absolute right-3 top-1/2 z-20 -translate-y-1/2 sm:right-4 md:right-6 lg:right-8 xl:right-10">
            <TooltipProvider delayDuration={100}>
              <div className="flex flex-col gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={onOpenDetails}
                      title="Client details"
                      aria-label="Client details"
                      className="flex h-10 w-10 items-center justify-center rounded-full border border-border/50 bg-background/90 text-muted-foreground shadow-sm backdrop-blur-sm transition-all hover:scale-105 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
                      className="flex h-10 w-10 items-center justify-center rounded-full border border-border/50 bg-background/90 text-muted-foreground shadow-sm backdrop-blur-sm transition-all hover:scale-105 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
                      className="flex h-10 w-10 items-center justify-center rounded-full border border-border/50 bg-background/90 text-muted-foreground shadow-sm backdrop-blur-sm transition-all hover:scale-105 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      <BarChart3 className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="left">KPIs & requirements</TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>
          </div>
        )}
    </PageHeroShell>
  )
}
