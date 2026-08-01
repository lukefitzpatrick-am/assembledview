"use client"

import { Badge } from "@/components/ui/badge"
import type { KpiPacingRow } from "@/lib/kpi/kpiPacing"
import { cn } from "@/lib/utils"

export type CampaignKpiPacingStripProps = {
  rows: KpiPacingRow[]
  className?: string
}

/**
 * Admin-only, display-only KPI pacing strip (B1-1).
 * Parent must gate on `isAdmin` and omit the section when `rows` is empty.
 */
export function CampaignKpiPacingStrip({ rows, className }: CampaignKpiPacingStripProps) {
  if (rows.length === 0) return null

  return (
    <section
      aria-label="KPI pacing"
      className={cn(
        "rounded-card border border-border bg-card p-4 shadow-e1 sm:p-5",
        className,
      )}
    >
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">KPI pacing</h2>
        <p className="text-xs text-muted-foreground">Admin preview · read-only</p>
      </div>

      <ul className="divide-y divide-border/60">
        {rows.map((row) => (
          <li
            key={row.metric}
            className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
          >
            <div className="min-w-0 sm:w-36">
              <p className="text-sm font-medium text-foreground">{row.label}</p>
              {row.fallbackLabel ? (
                <p
                  className={cn(
                    "mt-0.5 text-xs",
                    row.kind === "no_delivery_feed"
                      ? "text-muted-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {row.fallbackLabel}
                </p>
              ) : null}
            </div>

            <div className="grid flex-1 grid-cols-3 gap-2 text-xs sm:max-w-xl">
              <div>
                <p className="text-muted-foreground">Target</p>
                <p className="num mt-0.5 font-medium text-foreground">{row.targetDisplay}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Delivered</p>
                <p className="num mt-0.5 font-medium text-foreground">{row.deliveredDisplay}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Expected</p>
                <p className="num mt-0.5 font-medium text-foreground">{row.expectedDisplay}</p>
              </div>
            </div>

            <div className="sm:w-28 sm:text-right">
              {row.statusPresentation ? (
                <Badge variant={row.statusPresentation.badgeVariant} size="sm">
                  {row.statusPresentation.label}
                </Badge>
              ) : (
                <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                  {row.kind === "no_delivery_feed" ? "No delivery feed" : "—"}
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
