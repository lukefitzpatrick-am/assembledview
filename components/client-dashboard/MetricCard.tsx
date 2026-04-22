"use client"

import type { ReactNode } from "react"

import { useClientBrand } from "@/components/client-dashboard/ClientBrandProvider"
import { DeltaBadge } from "@/components/client-dashboard/DeltaBadge"
import { CLIENT_DASHBOARD_FOCUS_RING } from "@/components/client-dashboard/focus-styles"
import { Panel, PanelContent } from "@/components/layout/Panel"
import { cn } from "@/lib/utils"

export type MetricCardProps = {
  label: string
  value: ReactNode
  delta?: number | null
  invertDelta?: boolean
  emphasis?: boolean
  subLabel?: string
  onClick?: () => void
  className?: string
}

export function MetricCard({
  label,
  value,
  delta,
  invertDelta,
  emphasis,
  subLabel,
  onClick,
  className,
}: MetricCardProps) {
  const theme = useClientBrand()

  const body = (
    <Panel
      className={cn(
        "rounded-xl shadow-md transition-colors",
        onClick && "group-hover:bg-muted/40",
        className,
      )}
    >
      {emphasis ? (
        <div
          className="h-0.5 w-full shrink-0"
          style={{ backgroundColor: theme.primary }}
          aria-hidden
        />
      ) : null}
      <PanelContent standalone className="space-y-2">
        <p className="text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <div
          className={cn(
            "font-semibold tabular-nums tracking-tight text-foreground",
            emphasis ? "text-3xl" : "text-2xl",
          )}
        >
          {value}
        </div>
        {delta !== undefined && delta !== null ? (
          <DeltaBadge value={delta} inverted={invertDelta} />
        ) : null}
        {subLabel ? <p className="text-xs text-muted-foreground">{subLabel}</p> : null}
      </PanelContent>
    </Panel>
  )

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn("group w-full rounded-xl text-left", CLIENT_DASHBOARD_FOCUS_RING)}
      >
        {body}
      </button>
    )
  }

  return body
}
