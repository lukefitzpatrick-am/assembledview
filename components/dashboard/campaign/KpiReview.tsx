"use client"

import { StatusPill } from "@/components/dashboard/delivery/shared/StatusPill"
import type { KpiReviewCard } from "@/lib/kpi/kpiReview"
import { cn } from "@/lib/utils"

export type KpiReviewProps = {
  cards: KpiReviewCard[]
  isAdmin?: boolean
  className?: string
}

function channelDotClass(key: string): string {
  if (key.startsWith("social-")) return "bg-channel-social"
  if (key === "search" || key.startsWith("search:")) return "bg-channel-search"
  if (key.startsWith("programmatic-ooh")) return "bg-channel-ooh"
  if (key.startsWith("programmatic-")) return "bg-channel-progDisplay"
  if (key.startsWith("bvod")) return "bg-channel-bvod"
  if (key.startsWith("digital-")) return "bg-channel-search"
  return "bg-muted-foreground"
}

export function KpiReview({ cards, isAdmin = false, className }: KpiReviewProps) {
  if (cards.length === 0) return null

  return (
    <section aria-label="KPI review" className={cn("space-y-3", className)}>
      <div>
        <h2 className="text-sm font-semibold text-foreground">KPI review</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Per channel against the saved line targets
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {cards.map((card) => (
          <article
            key={card.key}
            className="rounded-card border border-border bg-card p-4 shadow-e1"
          >
            <div className="mb-3 flex items-center gap-2">
              <span
                className={cn("h-2.5 w-2.5 shrink-0 rounded-full", channelDotClass(card.key))}
                aria-hidden
              />
              <h3 className="text-sm font-semibold text-foreground">{card.label}</h3>
            </div>
            <ul className="divide-y divide-border/60">
              {card.rows.map((row) => {
                if (row.omitted && !isAdmin) return null
                return (
                  <li
                    key={row.metric}
                    className={cn(
                      "grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-3 py-2.5 first:pt-0 last:pb-0",
                      row.omitted && "opacity-60",
                    )}
                  >
                    <p
                      className={cn(
                        "truncate text-sm font-medium",
                        row.omitted ? "text-muted-foreground" : "text-foreground",
                      )}
                    >
                      {row.label}
                    </p>
                    <div className="min-w-[4.5rem] text-right">
                      <p className="text-[11px] text-muted-foreground">Target</p>
                      <p
                        className={cn(
                          "num text-xs font-medium tabular-nums",
                          row.omitted ? "text-muted-foreground" : "text-foreground",
                        )}
                      >
                        {row.targetDisplay}
                      </p>
                    </div>
                    <div className="min-w-[5.5rem] text-right">
                      <p className="text-[11px] text-muted-foreground">Delivered</p>
                      <p
                        className={cn(
                          "num text-xs font-medium tabular-nums",
                          row.omitted ? "text-muted-foreground" : "text-foreground",
                        )}
                      >
                        {row.deliveredDisplay}
                      </p>
                      {row.modelled ? (
                        <p className="text-[11px] text-muted-foreground">modelled</p>
                      ) : null}
                    </div>
                    <div className="flex min-w-[5.5rem] justify-end">
                      {row.omitted ? (
                        <span className="text-[11px] text-muted-foreground">No target</span>
                      ) : (
                        <StatusPill status={row.status} />
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          </article>
        ))}
      </div>
    </section>
  )
}
