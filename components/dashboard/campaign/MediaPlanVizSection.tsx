"use client"

import { useCallback, useMemo, useRef, useState } from "react"
import { BarChart3, CalendarRange, Download, Rows3 } from "lucide-react"
import { ResponsiveContainer, AreaChart, Area } from "recharts"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Panel, PanelContent, PanelHeader, PanelTitle } from "@/components/layout/Panel"
import { normaliseLineItemsByType, type NormalisedLineItem } from "@/lib/mediaplan/normalizeLineItem"
import { formatCurrencyAUD, formatCurrencyCompact } from "@/lib/format/currency"
import { cn } from "@/lib/utils"
import { getMediaColor } from "@/lib/charts/registry"
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

function sanitizeFilenameBase(parts: (string | undefined)[]): string {
  const raw = parts.filter(Boolean).join("-")
  const cleaned = raw.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "")
  return cleaned || "media-plan"
}

/** Normalize cloned DOM so html2canvas captures full scroll area and readable text. */
function prepareMediaPlanExportClone(_document: Document, clonedElement: HTMLElement) {
  clonedElement.querySelectorAll<HTMLElement>('[data-export="media-plan-table-scroll"]').forEach((el) => {
    el.style.maxHeight = "none"
    el.style.overflow = "visible"
    el.style.height = "auto"
  })

  clonedElement.querySelectorAll<HTMLElement>('[data-export="media-plan-gantt-root"]').forEach((el) => {
    el.style.overflow = "visible"
    el.style.overflowX = "visible"
    el.style.overflowY = "visible"
  })
  if (clonedElement.dataset.export === "media-plan-gantt-root") {
    clonedElement.style.overflow = "visible"
    clonedElement.style.overflowX = "visible"
    clonedElement.style.overflowY = "visible"
  }

  clonedElement.querySelectorAll<HTMLElement>(".sticky").forEach((el) => {
    el.style.position = "relative"
    el.style.top = "auto"
    el.style.bottom = "auto"
    el.style.zIndex = "auto"
  })

  clonedElement.querySelectorAll<HTMLElement>("[class*='backdrop-blur']").forEach((el) => {
    el.style.backdropFilter = "none"
    el.style.setProperty("-webkit-backdrop-filter", "none")
  })

  const lineClampSelectors = [".line-clamp-1", ".line-clamp-2", ".line-clamp-3", ".line-clamp-4", ".line-clamp-5", ".line-clamp-6"]
  lineClampSelectors.forEach((sel) => {
    clonedElement.querySelectorAll<HTMLElement>(sel).forEach((el) => {
      el.style.whiteSpace = "normal"
      el.style.overflow = "visible"
      el.style.display = "block"
      el.style.webkitLineClamp = "unset"
      el.style.setProperty("-webkit-box-orient", "unset")
    })
  })

  clonedElement.querySelectorAll<HTMLElement>(".truncate").forEach((el) => {
    el.style.whiteSpace = "normal"
    el.style.overflow = "visible"
    el.style.textOverflow = "clip"
  })
}

export default function MediaPlanVizSection({
  lineItems,
  campaignStart,
  campaignEnd,
  clientSlug,
  mbaNumber,
  defaultView = "timeline",
  onViewChange,
}: MediaPlanVizSectionProps) {
  const [view, setView] = useState<"timeline" | "table" | "summary">(defaultView)
  const [timelineGranularity, setTimelineGranularity] = useState<"weekly" | "monthly">("weekly")
  const [exporting, setExporting] = useState(false)

  const timelineRef = useRef<HTMLDivElement>(null)
  const tableRef = useRef<HTMLDivElement>(null)
  const summaryRef = useRef<HTMLDivElement>(null)

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

  const handleExportPng = useCallback(async () => {
    const el =
      view === "timeline" ? timelineRef.current : view === "table" ? tableRef.current : summaryRef.current
    if (!el) return

    setExporting(true)
    try {
      try {
        await document.fonts.ready
      } catch {
        /* Font Loading API optional */
      }
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      })

      const html2canvas = (await import("html2canvas")).default
      const canvas = await html2canvas(el, {
        backgroundColor: "#ffffff",
        scale: 2,
        useCORS: true,
        logging: false,
        onclone: prepareMediaPlanExportClone,
      })
      const link = document.createElement("a")
      link.href = canvas.toDataURL("image/png")
      const viewPart =
        view === "timeline" ? `timeline-${timelineGranularity}` : view === "table" ? "table" : "summary"
      const base = sanitizeFilenameBase(["media-plan", clientSlug, mbaNumber, viewPart])
      link.download = `${base}.png`
      link.click()
    } finally {
      setExporting(false)
    }
  }, [view, timelineGranularity, clientSlug, mbaNumber])

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
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="inline-flex w-fit max-w-full shrink-0 items-center gap-1 rounded-full border border-border/60 bg-muted/30 p-1">
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
          <div className="flex w-full shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border/50 pt-3 sm:ml-auto sm:w-auto sm:border-l sm:border-t-0 sm:border-border/60 sm:pl-4 sm:pt-0">
            {view === "timeline" ? (
              <div className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/30 p-1">
                <Button
                  type="button"
                  size="sm"
                  variant={timelineGranularity === "weekly" ? "secondary" : "ghost"}
                  className={cn("h-8 rounded-full px-3 text-xs", timelineGranularity === "weekly" && "font-semibold")}
                  onClick={() => setTimelineGranularity("weekly")}
                >
                  Weekly
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={timelineGranularity === "monthly" ? "secondary" : "ghost"}
                  className={cn("h-8 rounded-full px-3 text-xs", timelineGranularity === "monthly" && "font-semibold")}
                  onClick={() => setTimelineGranularity("monthly")}
                >
                  Monthly
                </Button>
              </div>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              disabled={exporting}
              onClick={() => void handleExportPng()}
            >
              <Download className="h-3.5 w-3.5" />
              {exporting ? "Exporting…" : "Download PNG"}
            </Button>
          </div>
        </div>
      </PanelHeader>

      <PanelContent standalone className="p-4">
        {view === "timeline" ? (
          <MediaGanttChart
            ref={timelineRef}
            lineItems={normalised}
            startDate={campaignStart || ""}
            endDate={campaignEnd || ""}
            granularity={timelineGranularity}
          />
        ) : null}

        {view === "table" ? (
          <div ref={tableRef} className="min-w-0">
            <MediaTable lineItems={normalised} />
          </div>
        ) : null}

        {view === "summary" ? (
          <div ref={summaryRef} className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {mediaSummary.map((row) => (
              <article key={row.mediaType} className="space-y-2 rounded-xl border border-border/60 bg-background/70 p-4">
                <div className="flex items-start justify-between gap-2">
                  <h4 className="text-sm font-semibold text-foreground">{row.label}</h4>
                  <Badge variant="secondary" className="rounded-full text-[11px]">
                    {row.lineItemCount} items
                  </Badge>
                </div>
                <p className="text-xl font-semibold text-foreground">{formatCurrencyAUD(row.totalBudget)}</p>
                <p className="text-xs text-muted-foreground">
                  {row.rangeStart || "—"} - {row.rangeEnd || "—"}
                </p>
                <div className="h-14 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={row.sparkline.map((value, idx) => ({ idx, value }))} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
                      <Area
                        type="monotone"
                        dataKey="value"
                        stroke={getMediaColor(row.mediaType)}
                        fill={getMediaColor(row.mediaType)}
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
