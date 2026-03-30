 "use client"

import { useMemo, useState } from "react"
import { BarChart3, CalendarRange, Rows3 } from "lucide-react"
import { ResponsiveContainer, AreaChart, Area } from "recharts"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Panel, PanelContent, PanelHeader, PanelTitle } from "@/components/layout/Panel"
import { normaliseLineItemsByType, type NormalisedLineItem } from "@/lib/mediaplan/normalizeLineItem"
import { formatCurrencyCompact, formatCurrencyFull } from "@/lib/format/currency"
import { cn } from "@/lib/utils"
import { getMediaChannelColor } from "@/lib/media/channelColors"
import MediaGanttChart from "@/app/dashboard/[slug]/[mba_number]/components/MediaGanttChart"
import MediaTable from "@/app/dashboard/[slug]/[mba_number]/components/MediaTable"

export type MediaPlanVizSectionProps = {
  lineItems: Record<string, any[]>
  campaignStart?: string
  campaignEnd?: string
  clientSlug?: string
  mbaNumber?: string
  defaultView?: "timeline" | "table" | "summary"
  onViewChange?: (view: string) => void
}

const MEDIA_ORDER = [
  "television",
  "bvod",
  "digitalVideo",
  "digitalDisplay",
  "digitalAudio",
  "progVideo",
  "progDisplay",
  "progBvod",
  "progAudio",
  "progOoh",
  "socialMedia",
  "search",
  "radio",
  "ooh",
  "cinema",
  "newspaper",
  "magazines",
  "integration",
  "influencers",
  "production",
  "consulting",
]

function formatMediaTypeLabel(key: string) {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(" ")
}

export default function MediaPlanVizSection({
  lineItems,
  campaignStart,
  campaignEnd,
  defaultView = "timeline",
  onViewChange,
}: MediaPlanVizSectionProps) {
  const [view, setView] = useState<"timeline" | "table" | "summary">(defaultView)
  const normalised = useMemo(() => normaliseLineItemsByType(lineItems || {}), [lineItems])
  const lineItemCount = useMemo(
    () => Object.values(normalised).reduce((sum, items) => sum + (Array.isArray(items) ? items.length : 0), 0),
    [normalised]
  )

  const mediaSummary = useMemo(() => {
    const rows = Object.entries(normalised).map(([mediaType, items]) => {
      const typed = (items || []) as NormalisedLineItem[]
      const totalBudget = typed.reduce(
        (sum, item) => sum + item.bursts.reduce((burstSum, burst) => burstSum + (burst.deliverablesAmount || burst.budget || 0), 0),
        0
      )
      const starts = typed.flatMap((item) => item.bursts.map((burst) => burst.startDate)).filter(Boolean)
      const ends = typed.flatMap((item) => item.bursts.map((burst) => burst.endDate)).filter(Boolean)
      const sparkline = typed
        .flatMap((item) => item.bursts.map((burst) => Number(burst.deliverablesAmount || burst.budget || 0)))
        .slice(0, 12)
      return {
        mediaType,
        label: formatMediaTypeLabel(mediaType),
        totalBudget,
        lineItemCount: typed.length,
        rangeStart: starts.length ? starts.sort()[0] : undefined,
        rangeEnd: ends.length ? ends.sort()[ends.length - 1] : undefined,
        sparkline: sparkline.length ? sparkline : [0],
      }
    })
    const orderMap = new Map(MEDIA_ORDER.map((key, idx) => [key.toLowerCase(), idx]))
    return rows
      .filter((row) => row.lineItemCount > 0)
      .sort((a, b) => (orderMap.get(a.mediaType.toLowerCase()) ?? 999) - (orderMap.get(b.mediaType.toLowerCase()) ?? 999))
  }, [normalised])

  const hasData = lineItemCount > 0
  const changeView = (next: "timeline" | "table" | "summary") => {
    setView(next)
    onViewChange?.(next)
  }

  if (!hasData) {
    return (
      <Panel className="border-border/60 shadow-sm">
        <PanelHeader>
          <PanelTitle className="text-base">Media plan</PanelTitle>
        </PanelHeader>
        <PanelContent>
          <p className="text-sm text-muted-foreground">No media plan data available.</p>
        </PanelContent>
      </Panel>
    )
  }

  return (
    <Panel className="border-border/60 bg-card shadow-sm">
      <PanelHeader className="flex flex-col gap-3 border-b border-border/60">
        <div className="flex items-center justify-between gap-2">
          <PanelTitle className="text-base">Media plan</PanelTitle>
          <Badge variant="outline" className="rounded-full">
            {lineItemCount} line items
          </Badge>
        </div>
        <div className="inline-flex w-fit items-center gap-1 rounded-full border border-border/60 bg-muted/30 p-1">
          <Button
            type="button"
            size="sm"
            variant={view === "timeline" ? "secondary" : "ghost"}
            className={cn("h-8 rounded-full px-3 text-xs", view === "timeline" && "font-semibold")}
            onClick={() => changeView("timeline")}
          >
            <CalendarRange className="mr-1.5 h-3.5 w-3.5" />
            Timeline
          </Button>
          <Button
            type="button"
            size="sm"
            variant={view === "table" ? "secondary" : "ghost"}
            className={cn("h-8 rounded-full px-3 text-xs", view === "table" && "font-semibold")}
            onClick={() => changeView("table")}
          >
            <Rows3 className="mr-1.5 h-3.5 w-3.5" />
            Table
          </Button>
          <Button
            type="button"
            size="sm"
            variant={view === "summary" ? "secondary" : "ghost"}
            className={cn("h-8 rounded-full px-3 text-xs", view === "summary" && "font-semibold")}
            onClick={() => changeView("summary")}
          >
            <BarChart3 className="mr-1.5 h-3.5 w-3.5" />
            Summary
          </Button>
        </div>
      </PanelHeader>

      <PanelContent standalone className="p-4">
        {view === "timeline" ? (
          <MediaGanttChart lineItems={normalised} startDate={campaignStart || ""} endDate={campaignEnd || ""} />
        ) : null}

        {view === "table" ? <MediaTable lineItems={normalised} /> : null}

        {view === "summary" ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {mediaSummary.map((row) => (
              <article key={row.mediaType} className="space-y-2 rounded-xl border border-border/60 bg-background/70 p-4">
                <div className="flex items-start justify-between gap-2">
                  <h4 className="text-sm font-semibold text-foreground">{row.label}</h4>
                  <Badge variant="secondary" className="rounded-full text-[11px]">
                    {row.lineItemCount} items
                  </Badge>
                </div>
                <p className="text-xl font-semibold text-foreground">{formatCurrencyFull(row.totalBudget)}</p>
                <p className="text-xs text-muted-foreground">
                  {row.rangeStart || "—"} - {row.rangeEnd || "—"}
                </p>
                <div className="h-14 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={row.sparkline.map((value, idx) => ({ idx, value }))} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
                      <Area
                        type="monotone"
                        dataKey="value"
                        stroke={getMediaChannelColor(row.mediaType)}
                        fill={getMediaChannelColor(row.mediaType)}
                        fillOpacity={0.22}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-xs text-muted-foreground">Total budget: {formatCurrencyCompact(row.totalBudget)}</p>
              </article>
            ))}
          </div>
        ) : null}
      </PanelContent>
    </Panel>
  )
}
