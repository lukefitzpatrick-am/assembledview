"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { Lightbulb } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

export type RecentInsightCard = {
  id: number
  mbaNumber: string
  period: string | null
  insightType: string
  body: string
  source: string
  createdAt: string
}

type RecentInsightsPanelProps = {
  /** Pre-filter for /insights deep link. */
  hrefQuery: Record<string, string>
  /** API query string (without leading ?). */
  apiQuery: string
  title?: string
  className?: string
  emptyMessage?: string
}

function buildInsightsHref(query: Record<string, string>): string {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) {
    if (v) sp.set(k, v)
  }
  const qs = sp.toString()
  return qs ? `/insights?${qs}` : "/insights"
}

/**
 * Admin-only recent insights strip. Fetches via /api/insights (403 for client role).
 * Does not render for failed auth — returns null so client dashboards stay clean.
 */
export function RecentInsightsPanel({
  hrefQuery,
  apiQuery,
  title = "Recent insights",
  className,
  emptyMessage = "No insights yet for this scope.",
}: RecentInsightsPanelProps) {
  const [items, setItems] = useState<RecentInsightCard[] | null>(null)
  const [forbidden, setForbidden] = useState(false)
  const [error, setError] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/insights?${apiQuery}`, { cache: "no-store" })
        if (res.status === 401 || res.status === 403) {
          if (!cancelled) setForbidden(true)
          return
        }
        if (!res.ok) {
          if (!cancelled) setError(true)
          return
        }
        const data = (await res.json()) as { items?: RecentInsightCard[] }
        if (!cancelled) setItems(Array.isArray(data.items) ? data.items.slice(0, 5) : [])
      } catch {
        if (!cancelled) setError(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [apiQuery, refreshKey])

  useEffect(() => {
    const onChanged = () => setRefreshKey((k) => k + 1)
    window.addEventListener("insights:changed", onChanged)
    return () => window.removeEventListener("insights:changed", onChanged)
  }, [])

  if (forbidden) return null

  const libraryHref = buildInsightsHref(hrefQuery)

  return (
    <section
      className={cn(
        "rounded-card border border-border bg-card p-4 shadow-e1",
        className,
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-muted-foreground" aria-hidden strokeWidth={1.8} />
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        </div>
        <Link
          href={libraryHref}
          className="text-xs font-medium text-primary transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          View all →
        </Link>
      </div>

      {items == null && !error ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-4/5" />
        </div>
      ) : null}

      {error ? (
        <p className="text-sm text-muted-foreground">Could not load insights.</p>
      ) : null}

      {items && items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      ) : null}

      {items && items.length > 0 ? (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={buildInsightsHref({
                  ...hrefQuery,
                  ...(item.mbaNumber ? { mba: item.mbaNumber } : {}),
                })}
                className="interactive-tint block rounded-input border border-transparent px-2 py-2 transition-colors hover:bg-table-row-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="mb-1 flex flex-wrap items-center gap-1.5">
                  <Badge variant="secondary" size="sm">
                    {item.insightType}
                  </Badge>
                  <Badge variant="outline" size="sm">
                    {item.source}
                  </Badge>
                  {item.period ? (
                    <span className="num text-[11px] text-muted-foreground">{item.period}</span>
                  ) : null}
                  {item.mbaNumber ? (
                    <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      {item.mbaNumber}
                    </span>
                  ) : null}
                </div>
                <p className="line-clamp-2 text-sm text-foreground">{item.body}</p>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
