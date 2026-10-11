"use client"

import type { ReactNode } from "react"
import { BarChart3, Brain, DollarSign, FileText } from "lucide-react"

import { ClientMark } from "@/components/brand/EntityMark"
import { ClientProfileLinks } from "@/components/dashboard/ClientProfileLinks"
import { PageHeader, withFullStop } from "@/components/layout/PageHeader"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { formatMoneyCompact, formatPercent } from "@/lib/format/money"
import { cn } from "@/lib/utils"

export interface HeroBannerProps {
  clientName: string
  clientLogo?: string | null
  /** @deprecated Client colour paints only ClientMark. */
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
  /** True only for a client-role viewer. Admin and staff see the client name. */
  viewerIsClient?: boolean
  /** Same gate as the expected-media tile. Hides the figure until it is final. */
  spendLoading?: boolean
  /** Client hub (/client/[slug]): omit benchmark line and Avg ROAS meta. */
  clientHubLayout?: boolean
  /** Raw Xano client row — used for profile link icons on admin hub. */
  clientRecord?: Record<string, unknown> | null
  /** Header actions. The client hub passes Change range. */
  actions?: ReactNode
}

function formatRoas(value: number): string {
  return `${new Intl.NumberFormat("en-AU", { maximumFractionDigits: 2 }).format(value)}x`
}

const heroIconButtonClassName =
  "interactive flex h-9 w-9 items-center justify-center rounded-pill border border-border bg-card text-muted-foreground shadow-e0 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"

export function HeroBanner({
  clientName,
  clientLogo,
  brandColour,
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
  viewerIsClient = false,
  spendLoading = false,
  clientHubLayout = false,
  clientRecord = null,
  actions,
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
        {spendLoading ? (
          <span
            className="inline-block h-4 w-40 animate-pulse rounded bg-muted/60"
            aria-busy="true"
            aria-label={`${spendLabel} loading`}
          />
        ) : (
          <span>
            {spendLabel}: {formatMoneyCompact(totalSpend)}
          </span>
        )}
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

  const heading = viewerIsClient ? withFullStop(`Welcome back, ${clientName}`) : clientName

  return (
    <PageHeader
      punctuate={false}
      title={
        <span className="inline-flex items-center gap-3">
          <ClientMark name={clientName} colour={brandColour} logoUrl={clientLogo} size="lg" />
          <span>{heading}</span>
        </span>
      }
      lede={detail}
      meta={showProfileLinks ? <ClientProfileLinks record={clientRecord} /> : undefined}
      actions={
        actions || showAdminRail ? (
          <>
            {actions}
            {showAdminRail ? (
          <TooltipProvider delayDuration={100}>
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
            ) : null}
          </>
        ) : undefined
      }
    />
  )
}
