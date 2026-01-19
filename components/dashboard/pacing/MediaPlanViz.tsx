"use client"

import { useMemo, useRef } from "react"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { downloadCSV } from "@/lib/utils/csv-export"

export type MediaPlanVizBurst = {
  id: string
  start: string
  end: string
  label?: string
  deliverables?: number
  spend?: number
}

export type MediaPlanVizRow = {
  id: string
  title: string
  subtitle?: string
  budget?: number
  start: string
  end: string
  bursts: MediaPlanVizBurst[]
}

export type MediaPlanVizGroup = {
  channel: string
  rows: MediaPlanVizRow[]
}

type Props = {
  groups: MediaPlanVizGroup[]
  campaignStart?: string
  campaignEnd?: string
  clientSlug?: string
  mbaNumber?: string
}

function parseDateSafe(value?: string) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function startOfDay(date: Date) {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next
}

function endOfDay(date: Date) {
  const next = new Date(date)
  next.setHours(23, 59, 59, 999)
  return next
}

function getRange(groups: MediaPlanVizGroup[], campaignStart?: string, campaignEnd?: string) {
  const startOverride = parseDateSafe(campaignStart)
  const endOverride = parseDateSafe(campaignEnd)
  if (startOverride && endOverride) {
    return { start: startOfDay(startOverride), end: endOfDay(endOverride) }
  }

  let minDate: Date | null = startOverride ? startOfDay(startOverride) : null
  let maxDate: Date | null = endOverride ? endOfDay(endOverride) : null

  groups.forEach((group) => {
    group.rows.forEach((row) => {
      const start = parseDateSafe(row.start)
      const end = parseDateSafe(row.end)
      if (start && (!minDate || start < minDate)) minDate = start
      if (end && (!maxDate || end > maxDate)) maxDate = end
    })
  })

  if (!minDate || !maxDate) {
    const today = new Date()
    const day = startOfDay(today)
    return { start: day, end: endOfDay(day) }
  }

  return { start: minDate, end: maxDate }
}

function getMonthSegments(start: Date, end: Date) {
  const segments: { label: string; start: Date; end: Date }[] = []
  let cursor = startOfDay(start)

  while (cursor <= end) {
    const segmentStart = startOfDay(cursor)
    const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0)
    const segmentEnd = endOfDay(monthEnd > end ? end : monthEnd)

    segments.push({
      label: segmentStart.toLocaleDateString("en-AU", { month: "short" }),
      start: segmentStart,
      end: segmentEnd,
    })

    const next = new Date(segmentEnd)
    next.setDate(next.getDate() + 1)
    cursor = next
  }

  return segments
}

function ratioBetween(date: Date, start: Date, end: Date) {
  const total = end.getTime() - start.getTime()
  if (total <= 0) return 0
  return (date.getTime() - start.getTime()) / total
}

const palette = ["#4f46e5", "#22c55e", "#f97316", "#06b6d4", "#f43f5e", "#a855f7", "#0ea5e9"]
const ROW_LAYOUT = {
  labelWidth: 260,
  budgetWidth: 140,
  columnGap: 12,
  paddingX: 12,
}

function clampPercent(value: number) {
  if (Number.isNaN(value)) return 0
  return Math.min(100, Math.max(0, value))
}

function formatCurrency(value?: number) {
  if (value === undefined || value === null) return "—"
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(value)
}

function formatDateRange(start: Date, end: Date) {
  const formatter = new Intl.DateTimeFormat("en-AU", { day: "2-digit", month: "short", year: "numeric" })
  return `${formatter.format(start)} - ${formatter.format(end)}`
}

function formatTooltip(burst: MediaPlanVizBurst, start: Date, end: Date) {
  const parts = [`${formatDateRange(start, end)}`]
  if (burst.deliverables !== undefined) {
    parts.push(`Deliverables: ${burst.deliverables.toLocaleString("en-AU")}`)
  }
  if (burst.spend !== undefined) {
    parts.push(`Spend: ${formatCurrency(burst.spend)}`)
  }
  return parts.join(" • ")
}

function formatBurstLabel(burst: MediaPlanVizBurst) {
  if (burst.label) return burst.label
  if (burst.deliverables !== undefined) {
    return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(burst.deliverables)
  }
  if (burst.spend !== undefined) {
    return formatCurrency(burst.spend)
  }
  return undefined
}

function sanitizeFilename(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)+/g, "") || "media-plan"
  )
}

export function MediaPlanViz({ groups, campaignStart, campaignEnd, clientSlug, mbaNumber }: Props) {
  const cardRef = useRef<HTMLDivElement | null>(null)

  const { start, end } = getRange(groups, campaignStart, campaignEnd)
  const monthSegments = getMonthSegments(start, end)
  const totalMs = Math.max(end.getTime() - start.getTime(), 1)
  const gridStyle = {
    gridTemplateColumns: `${ROW_LAYOUT.labelWidth}px ${ROW_LAYOUT.budgetWidth}px 1fr`,
    columnGap: `${ROW_LAYOUT.columnGap}px`,
    paddingLeft: `${ROW_LAYOUT.paddingX}px`,
    paddingRight: `${ROW_LAYOUT.paddingX}px`,
  }

  const csvRows = useMemo(() => {
    return groups.flatMap((group) =>
      group.rows.flatMap((row) => {
        const bursts = row.bursts?.length
          ? row.bursts
          : [
              {
                id: `${row.id}-single`,
                start: row.start,
                end: row.end,
                deliverables: undefined,
                spend: row.budget,
                label: undefined,
              },
            ]

        return bursts.map((burst) => ({
          channel: group.channel,
          line_item_id: row.id,
          line_item_title: row.title,
          row_start: row.start,
          row_end: row.end,
          budget: row.budget ?? "",
          burst_id: burst.id,
          burst_start: burst.start,
          burst_end: burst.end,
          burst_deliverables: burst.deliverables ?? "",
          burst_spend: burst.spend ?? row.budget ?? "",
          burst_label: burst.label ?? "",
        }))
      })
    )
  }, [groups])

  const filenameBase = useMemo(() => {
    const parts = ["media-plan", clientSlug, mbaNumber].filter(Boolean).join("-")
    return sanitizeFilename(parts || "media-plan")
  }, [clientSlug, mbaNumber])

  const handleExportCsv = () => {
    if (!csvRows.length) return
    downloadCSV(csvRows, `${filenameBase}-bursts`)
  }

  const handleExportPng = async () => {
    if (!cardRef.current) return
    const html2canvas = (await import("html2canvas")).default
    const canvas = await html2canvas(cardRef.current, {
      backgroundColor: "#ffffff",
      scale: 2,
    })
    const link = document.createElement("a")
    link.href = canvas.toDataURL("image/png")
    link.download = `${filenameBase}.png`
    link.click()
  }

  return (
    <div ref={cardRef}>
      <Card className="rounded-2xl border-muted/70 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-base">Media plan visualisation</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleExportCsv}>
                Export CSV
              </Button>
              <Button variant="outline" size="sm" onClick={handleExportPng}>
                Export PNG
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0 space-y-1">
          <div className="overflow-x-auto">
            <div className="min-w-[900px] space-y-1">
              <div className="grid items-center text-xs text-muted-foreground" style={gridStyle}>
                <div />
                <div />
                <div className="flex items-center justify-between">
                  <span>{start.toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" })}</span>
                  <span>{end.toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" })}</span>
                </div>
              </div>
              <div className="grid" style={gridStyle}>
                <div />
                <div />
                <div className="relative h-10 rounded-xl bg-background/80 ring-1 ring-muted">
                  {monthSegments.map((segment) => {
                    const left = ratioBetween(segment.start, start, end) * 100
                    const width = clampPercent(
                      ((segment.end.getTime() - segment.start.getTime()) / totalMs) * 100
                    )
                    return (
                      <div
                        key={segment.label + segment.start.toISOString()}
                        className="absolute top-0 bottom-0 border-r border-muted/70"
                        style={{ left: `${left}%`, width: `${width}%` }}
                      >
                        <div className="absolute left-1 top-1 text-[11px] text-muted-foreground">
                          {segment.label}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>

          <Accordion type="multiple" defaultValue={groups.map((g) => g.channel)} className="space-y-0">
            {groups.map((group, groupIdx) => (
              <AccordionItem key={group.channel} value={group.channel} className="border-none">
                <AccordionTrigger className="text-sm font-semibold">{group.channel}</AccordionTrigger>
                <AccordionContent>
                  <ScrollArea className="w-full rounded-xl border bg-muted/10">
                    <div className="min-w-[900px] p-3 space-y-2">
                      <div className="space-y-1.5">
                        {group.rows.map((row, idx) => {
                          const rowBursts = row.bursts?.length
                            ? row.bursts
                            : [{ id: `${row.id}-single`, start: row.start, end: row.end, deliverables: undefined, spend: row.budget }]

                          return (
                            <div
                              key={row.id}
                              className="grid items-center rounded-xl bg-background/60 py-2"
                              style={gridStyle}
                            >
                              <div>
                                <div className="text-sm font-semibold leading-tight">{row.title}</div>
                              </div>
                              <div className="text-sm text-muted-foreground">{formatCurrency(row.budget)}</div>
                              <div className="relative h-8 overflow-hidden rounded-full bg-muted/70">
                                {rowBursts.map((burst, burstIdx) => {
                                  const burstStart = parseDateSafe(burst.start)
                                  const burstEnd = parseDateSafe(burst.end) ?? burstStart
                                  if (!burstStart || !burstEnd) return null
                                  if (burstEnd < start || burstStart > end) return null

                                  const clampedStart = burstStart < start ? start : burstStart
                                  const clampedEnd = burstEnd > end ? end : burstEnd
                                  const startRatio = clampPercent(
                                    ((clampedStart.getTime() - start.getTime()) / totalMs) * 100
                                  )
                                  const endRatio = clampPercent(
                                    ((clampedEnd.getTime() - start.getTime()) / totalMs) * 100
                                  )
                                  const rawWidth = endRatio - startRatio
                                  const minWidth = totalMs === 1 ? 4 : 2
                                  const width = Math.min(100 - startRatio, Math.max(rawWidth, minWidth))
                                  const budgetValue = burst.spend ?? row.budget
                                  const budgetLabel =
                                    budgetValue !== undefined ? formatCurrency(budgetValue) : undefined
                                  const deliverableLabel =
                                    burst.deliverables !== undefined
                                      ? new Intl.NumberFormat("en-US", {
                                          notation: "compact",
                                          maximumFractionDigits: 1,
                                        }).format(burst.deliverables)
                                      : burst.label
                                  const primaryLabel = budgetLabel ?? deliverableLabel
                                  const secondaryLabel = budgetLabel && deliverableLabel ? deliverableLabel : undefined

                                  return (
                                    <div
                                      key={`${row.id}-${burst.id}-${burstIdx}`}
                                      title={formatTooltip(burst, burstStart, burstEnd)}
                                      className="absolute top-1 bottom-1 overflow-hidden rounded-full shadow-sm"
                                      style={{
                                        left: `${startRatio}%`,
                                        width: `${width}%`,
                                        background: palette[(groupIdx + idx + burstIdx) % palette.length],
                                      }}
                                    >
                                      {primaryLabel ? (
                                        <div className="flex h-full items-center px-2 text-[11px] font-semibold text-primary-foreground drop-shadow">
                                          <span className="truncate">{primaryLabel}</span>
                                          {secondaryLabel ? (
                                            <span className="ml-2 text-[10px] font-normal text-primary-foreground/80">
                                              {secondaryLabel}
                                            </span>
                                          ) : null}
                                        </div>
                                      ) : null}
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </ScrollArea>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>
    </div>
  )
}
