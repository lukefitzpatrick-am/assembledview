import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react"
import type { ReactNode } from "react"

export type KpiTrend = {
  /** Screen reader + visible change summary, e.g. "+12% vs prior period" */
  label: string
  direction: "up" | "down" | "flat"
  /**
   * Semantic coloring: "positive" / "negative" for good/bad (e.g. cost down = positive).
   * Defaults: up → neutral, down → neutral, flat → neutral.
   */
  sentiment?: "positive" | "negative" | "neutral"
}

export type KpiStripItem = {
  id: string
  label: string
  value: ReactNode
  /** Optional supporting line under the value */
  description?: string
  trend?: KpiTrend
}

export type KpiStripDensity = "compact" | "comfortable"

export type KpiStripProps = {
  items: readonly KpiStripItem[]
  density?: KpiStripDensity
  className?: string
}

const densityConfig: Record<
  KpiStripDensity,
  {
    gridGap: string
    cardPadding: string
    label: string
    value: string
    description: string
    trendText: string
    icon: string
    trendGap: string
  }
> = {
  compact: {
    gridGap: "gap-2",
    cardPadding: "p-3 sm:p-3.5",
    label: "text-xs font-medium leading-tight text-muted-foreground",
    value: "text-lg font-semibold leading-tight tracking-tight text-card-foreground",
    description: "text-xs leading-snug text-muted-foreground",
    trendText: "text-xs font-medium leading-none",
    icon: "size-3.5 shrink-0",
    trendGap: "gap-1",
  },
  comfortable: {
    gridGap: "gap-3 sm:gap-4",
    cardPadding: "p-4 sm:p-5",
    label: "text-sm font-medium leading-snug text-muted-foreground",
    value: "text-2xl font-semibold leading-tight tracking-tight text-card-foreground",
    description: "text-sm leading-snug text-muted-foreground",
    trendText: "text-sm font-medium leading-none",
    icon: "size-4 shrink-0",
    trendGap: "gap-1.5",
  },
}

function trendSentiment(trend: KpiTrend): "positive" | "negative" | "neutral" {
  if (trend.sentiment) return trend.sentiment
  return "neutral"
}

function trendSemanticClass(sentiment: "positive" | "negative" | "neutral"): string {
  switch (sentiment) {
    case "positive":
      return "text-primary"
    case "negative":
      return "text-destructive"
    default:
      return "text-muted-foreground"
  }
}

function TrendGlyph({ direction, className }: { direction: KpiTrend["direction"]; className?: string }) {
  switch (direction) {
    case "up":
      return <ArrowUpRight className={className} aria-hidden />
    case "down":
      return <ArrowDownRight className={className} aria-hidden />
    default:
      return <ArrowRight className={className} aria-hidden />
  }
}

/**
 * Horizontal strip of 4–6 KPI cards. Uses theme semantic tokens only.
 * Pass `items.length` between 4 and 6 for the intended layout; fewer/more still render but may look sparse or crowded.
 */
export function KpiStrip({ items, density = "comfortable", className }: KpiStripProps) {
  const cfg = densityConfig[density]

  return (
    <div
      className={cn(
        "grid w-full grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 min-[1400px]:grid-cols-4",
        cfg.gridGap,
        className
      )}
    >
      {items.map((item) => (
        <Card
          key={item.id}
          className="border-border bg-card text-card-foreground shadow-sm transition-shadow hover:shadow-md"
        >
          <CardContent className={cn(cfg.cardPadding, "flex flex-col gap-2")}>
            <div className={cn(cfg.label)}>{item.label}</div>
            <div className="flex flex-col gap-1.5">
              <div className={cn(cfg.value)}>{item.value}</div>
              {item.description ? <p className={cn(cfg.description)}>{item.description}</p> : null}
              {item.trend ? (
                <div
                  className={cn("flex flex-wrap items-center", cfg.trendGap, trendSemanticClass(trendSentiment(item.trend)))}
                  title={item.trend.label}
                >
                  <TrendGlyph direction={item.trend.direction} className={cfg.icon} />
                  <span className={cn(cfg.trendText)}>{item.trend.label}</span>
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
