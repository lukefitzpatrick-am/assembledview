"use client"

import { Copy, FileSpreadsheet, ImageDown, RefreshCw } from "lucide-react"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ProgressCard } from "./shared/ProgressCard"
import { KpiBand } from "./shared/KpiBand"
import { LineItemBlock } from "./shared/LineItemBlock"
import { LineItemDailyDeliveryChart } from "./shared/LineItemDailyDeliveryChart"
import { getChannelIcon } from "./channels/getChannelIcon"
import type { ChannelSectionData } from "./channels/types"

function formatLastSynced(d: Date | null): string {
  if (!d) return "Not yet synced"
  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d)
}

function formatDateRange(startISO: string, endISO: string): string {
  const fmt = (iso: string) => {
    const d = new Date(iso)
    return Number.isNaN(d.getTime())
      ? iso
      : new Intl.DateTimeFormat("en-AU", { day: "2-digit", month: "short", year: "numeric" }).format(d)
  }
  return `${fmt(startISO)} - ${fmt(endISO)}`
}

export interface ChannelSectionProps {
  data: ChannelSectionData
  /** When true, the accordion item is open by default. */
  defaultOpen?: boolean
  onRefresh?: () => void
}

export function ChannelSection({ data, defaultOpen = false, onRefresh }: ChannelSectionProps) {
  const Icon = getChannelIcon(data.key)
  const accordionDefault = defaultOpen ? [data.key] : []

  return (
    <Accordion type="multiple" defaultValue={accordionDefault} className="w-full">
      <AccordionItem value={data.key} className="overflow-hidden rounded-2xl border border-border/60 bg-card">
        <AccordionTrigger className="px-4 py-3 hover:no-underline">
          <div className="flex w-full items-center gap-3">
            <Icon className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0 flex-1 text-left">
              <p className="text-sm font-semibold">{data.title}</p>
              <p className="text-xs text-muted-foreground">
                {formatDateRange(data.dateRange.startISO, data.dateRange.endISO)}
              </p>
            </div>
            <div className="hidden flex-wrap items-center gap-1 sm:flex">
              {data.connections.map((c) => (
                <Badge
                  key={c.label}
                  variant="secondary"
                  className="rounded-full px-2 py-0.5 text-[10px]"
                >
                  {c.label}
                </Badge>
              ))}
              <Badge variant="outline" className="rounded-full px-2 py-0.5 text-[10px]">
                Last synced {formatLastSynced(data.lastSyncedAt)}
              </Badge>
            </div>
          </div>
        </AccordionTrigger>
        <AccordionContent className="space-y-4 p-4 pt-0">
          {/* Aggregate */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/40 pt-4">
            <div className="flex flex-wrap gap-2">
              {data.aggregate.summaryChips.map((c) => (
                <div
                  key={c.label}
                  className="rounded-lg bg-muted/40 px-3 py-1.5"
                >
                  <p className="text-[11px] text-muted-foreground">{c.label}</p>
                  <p className="text-sm font-semibold tabular-nums">{c.value}</p>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Refresh"
                onClick={onRefresh}
                disabled={!onRefresh}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button type="button" variant="ghost" size="icon" aria-label="Export image">
                <ImageDown className="h-4 w-4" />
              </Button>
              <Button type="button" variant="ghost" size="icon" aria-label="Export CSV">
                <FileSpreadsheet className="h-4 w-4" />
              </Button>
              <Button type="button" variant="ghost" size="icon" aria-label="Copy link">
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <ProgressCard {...data.aggregate.progressCards[0]} />
            <ProgressCard {...data.aggregate.progressCards[1]} />
          </div>

          <KpiBand {...data.aggregate.kpiBand} />

          <LineItemDailyDeliveryChart
            daily={data.aggregate.chart.daily}
            series={data.aggregate.chart.series}
            asAtDate={data.aggregate.chart.asAtDate}
            brandColour={data.aggregate.chart.brandColour}
          />

          {data.lineItems.length > 0 ? (
            <div className="space-y-2 pt-2">
              <p className="text-xs font-medium text-muted-foreground">
                Line items ({data.lineItems.length})
              </p>
              <Accordion type="multiple" className="space-y-2">
                {data.lineItems.map((li) => (
                  <AccordionItem
                    key={li.id}
                    value={li.id}
                    className="overflow-hidden rounded-xl border border-border/40 bg-card"
                  >
                    <AccordionTrigger className="px-3 py-2 hover:no-underline">
                      <span className="text-sm font-medium">{li.block.name}</span>
                    </AccordionTrigger>
                    <AccordionContent className="border-t border-border/40 p-3">
                      <LineItemBlock {...li.block} />
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          ) : null}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}
