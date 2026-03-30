"use client"

import type { ReactNode } from "react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export type CampaignExportsVariant = "floating" | "inline" | "minimal" | "embedded"

export type CampaignExportsSectionProps = {
  variant: CampaignExportsVariant
  mbaNumber: string
  /** When omitted, the line-items badge is not rendered */
  lineItemCount?: number
  isBusy: boolean
  ariaStatus: string
  className?: string
  children: ReactNode
}

/**
 * Shared chrome for campaign export/download bars (MBA dashboard, media plan builder).
 * Matches layout and styling used by CampaignActions on the MBA detail page.
 */
export function CampaignExportsSection({
  variant,
  mbaNumber,
  lineItemCount,
  isBusy,
  ariaStatus,
  className,
  children,
}: CampaignExportsSectionProps) {
  const showFloating = variant === "floating"
  const showInline = variant === "inline"
  const showMinimal = variant === "minimal"
  const showEmbedded = variant === "embedded"
  const pillChrome = showFloating || showEmbedded

  return (
    <section
      className={cn(
        (showFloating || showInline || showMinimal) && "z-50",
        pillChrome &&
          "inline-flex flex-row flex-nowrap items-center gap-2 rounded-full border border-border bg-card/95 px-2 py-2 shadow-lg backdrop-blur-md overscroll-x-contain [scrollbar-width:thin] md:gap-3 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border",
        showFloating &&
          "fixed bottom-4 left-1/2 max-w-[min(96vw,960px)] -translate-x-1/2 overflow-x-auto",
        showEmbedded && "min-w-0 overflow-x-auto",
        showInline &&
          "flex flex-col gap-3 rounded-2xl border border-border/60 bg-card/80 p-4 shadow-sm backdrop-blur-sm md:flex-row md:items-center md:justify-between",
        showMinimal &&
          "flex flex-col gap-3 rounded-xl border border-border/60 bg-card/70 p-2 md:flex-row md:items-center md:justify-between",
        className,
      )}
      aria-busy={isBusy}
    >
      <span className="sr-only" aria-live="polite">
        {ariaStatus}
      </span>

      {pillChrome ? (
        <>
          <div className="hidden shrink-0 items-center gap-2 md:flex">
            <Badge variant="outline" className="rounded-full text-[11px]">
              MBA {mbaNumber}
            </Badge>
            {typeof lineItemCount === "number" ? (
              <Badge variant="outline" className="rounded-full text-[11px]">
                {lineItemCount} {showFloating ? "items" : "line items"}
              </Badge>
            ) : null}
          </div>
          <div className="inline-flex shrink-0 flex-nowrap items-center gap-2">{children}</div>
        </>
      ) : (
        <>
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-foreground">Exports &amp; files</h3>
            <p className="text-xs text-muted-foreground">
              Download campaign source files and share-ready documents.
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Badge variant="outline" className="rounded-full text-[11px]">
                MBA {mbaNumber}
              </Badge>
              {typeof lineItemCount === "number" ? (
                <Badge variant="outline" className="rounded-full text-[11px]">
                  {lineItemCount} line items
                </Badge>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">{children}</div>
        </>
      )}
    </section>
  )
}
