"use client"

import { Calendar, ChevronDown } from "lucide-react"

import { useClientBrand } from "@/components/client-dashboard/ClientBrandProvider"
import { CLIENT_DASHBOARD_FOCUS_RING } from "@/components/client-dashboard/focus-styles"
import { cn } from "@/lib/utils"

export type DashboardHeaderProps = {
  dateRangeLabel: string
  onDateRangeChange?: () => void
  /** Shown after client / sub-brand context (e.g. “Performance”). */
  dashboardTitle?: string
  className?: string
}

function AssembledMark({ className }: { className?: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      className={className}
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

function PoweredByAssembled() {
  return (
    <div className="flex items-center gap-1.5 border-r border-border pr-2 sm:gap-2 sm:pr-3">
      <span className="max-w-[6rem] text-end text-[0.55rem] font-semibold leading-tight tracking-wide text-muted-foreground sm:max-w-none">
        POWERED BY ASSEMBLED MEDIA
      </span>
      <AssembledMark className="h-5 w-5 shrink-0 text-muted-foreground" />
    </div>
  )
}

export function DashboardHeader({
  dateRangeLabel,
  onDateRangeChange,
  dashboardTitle = "Dashboard",
  className,
}: DashboardHeaderProps) {
  const theme = useClientBrand()
  const initial = theme.name.trim().charAt(0).toUpperCase() || "?"

  const dateControlClass = cn(
    "inline-flex h-9 max-w-[min(100%,18rem)] shrink-0 items-center gap-2 rounded-lg border border-border bg-card px-2.5 text-left text-xs font-medium text-foreground shadow-sm",
    onDateRangeChange && cn("cursor-pointer hover:bg-muted/50", CLIENT_DASHBOARD_FOCUS_RING),
  )

  const dateInner = (
    <>
      <Calendar className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 flex-1 truncate tabular-nums">{dateRangeLabel}</span>
      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
    </>
  )

  return (
    <header
      className={cn(
        "flex h-14 max-h-14 min-h-0 w-full items-center justify-between gap-2 border-b border-border bg-card/80 px-2 py-1.5 backdrop-blur-sm sm:gap-3 sm:px-4",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
        <div
          className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl text-lg font-semibold text-primary-foreground shadow-sm"
          style={{ backgroundColor: theme.primary }}
        >
          {theme.logoUrl ? (
            // Client logos are arbitrary URLs from Xano; avoid coupling next.config remotePatterns here.
            // eslint-disable-next-line @next/next/no-img-element -- dynamic client-supplied `logoUrl`
            <img src={theme.logoUrl} alt="" className="h-full w-full object-contain p-1.5" />
          ) : (
            <span aria-hidden>{initial}</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5 sm:gap-x-2">
            <span className="truncate text-sm font-semibold sm:text-base" style={{ color: theme.primary }}>
              {theme.name}
            </span>
            {theme.subName ? (
              <span className="truncate text-xs text-muted-foreground sm:text-sm">{theme.subName}</span>
            ) : null}
            <span className="hidden text-muted-foreground sm:inline" aria-hidden>
              ·
            </span>
            <span className="truncate text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground sm:text-xs">
              {dashboardTitle}
            </span>
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        <PoweredByAssembled />
        {onDateRangeChange ? (
          <button type="button" onClick={onDateRangeChange} className={dateControlClass}>
            {dateInner}
          </button>
        ) : (
          <div className={dateControlClass} role="group" aria-label={`Date range ${dateRangeLabel}`}>
            {dateInner}
          </div>
        )}
      </div>
    </header>
  )
}
