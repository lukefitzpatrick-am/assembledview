"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { format } from "date-fns"
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatPacingAud, formatPacingDate, formatPacingPct1 } from "@/components/pacing/formatters"
import { StatusPill } from "@/components/dashboard/delivery/shared/StatusPill"
import { computeLineItemPacingDerived } from "@/components/pacing/pacingMetrics"
import { pacingStatusForStatusPill } from "@/components/pacing/pacingStatusForStatusPill"
import { DeliveryHealthBadge } from "@/components/pacing/DeliveryHealthBadge"
import { fetchPacingDelivery, fetchPacingLineItemHistory } from "@/lib/xano/pacing-client"
import type { DeliveryPacingRow, LineItemPacingDailyPoint, LineItemPacingRow } from "@/lib/xano/pacing-types"
import {
  getMediaTypeConfig,
  PERFORMANCE_COLUMN_LABELS,
  type PerformanceColumnKey,
} from "@/lib/pacing/media-type-config"

type AggRow = {
  key: string
  platform: string
  campaign_name: string
  group_name: string
  group_type: string
  spend: number
  impressions: number
  clicks: number
  conversions: number
  ctr: number | null
  cpc: number | null
  cpa: number | null
  cpm: number | null
  roas: number | null
  reach: number
  frequency: number | null
  viewable_impressions: number
  viewability: number | null
  completed_views: number
  vcr: number | null
  delivery_pct: number | null
  target_cpa: number | null
  target_roas: number | null
  delivery_health: string | null
}

function aggregateDelivery(rows: DeliveryPacingRow[]): AggRow[] {
  type Acc = {
    key: string
    platform: string
    campaign_name: string
    group_name: string
    group_type: string
    spend: number
    impressions: number
    clicks: number
    conversions: number
    roasNum: number
    roasWt: number
    target_cpa: number | null
    target_roas: number | null
    healthBest: { spend: number; h: string | null }
    reach: number
    viewable_impressions: number
    completed_views: number
    freqNum: number
    freqDen: number
    viewNum: number
    viewDen: number
    deliveryPctBest: number | null
  }

  const map = new Map<string, Acc>()
  for (const r of rows) {
    const key = [
      String(r.platform ?? ""),
      String(r.campaign_name ?? ""),
      String(r.group_name ?? ""),
      String(r.group_type ?? ""),
    ].join("::")
    const spend = Number(r.spend ?? 0)
    let a = map.get(key)
    if (!a) {
      a = {
        key,
        platform: String(r.platform ?? "—"),
        campaign_name: String(r.campaign_name ?? "—"),
        group_name: String(r.group_name ?? "—"),
        group_type: String(r.group_type ?? "—"),
        spend: 0,
        impressions: 0,
        clicks: 0,
        conversions: 0,
        roasNum: 0,
        roasWt: 0,
        target_cpa: r.target_cpa ?? null,
        target_roas: r.target_roas ?? null,
        healthBest: { spend: -1, h: null },
        reach: 0,
        viewable_impressions: 0,
        completed_views: 0,
        freqNum: 0,
        freqDen: 0,
        viewNum: 0,
        viewDen: 0,
        deliveryPctBest: null,
      }
      map.set(key, a)
    }
    a.spend += spend
    const impr = Number(r.impressions ?? 0)
    a.impressions += impr
    a.clicks += Number(r.clicks ?? 0)
    a.conversions += Number(r.conversions ?? 0)
    a.reach += Number(r.reach ?? 0)
    a.viewable_impressions += Number(r.viewable_impressions ?? 0)
    a.completed_views += Number(r.completed_views ?? 0)
    const fq = Number(r.frequency ?? 0)
    if (Number.isFinite(fq) && impr > 0) {
      a.freqNum += fq * impr
      a.freqDen += impr
    }
    const vi = Number(r.viewable_impressions ?? 0)
    const vv = Number(r.viewability ?? 0)
    if (Number.isFinite(vv) && vi > 0) {
      a.viewNum += vv * vi
      a.viewDen += vi
    }
    const dp = Number(r.delivery_pct ?? NaN)
    if (Number.isFinite(dp)) {
      a.deliveryPctBest = a.deliveryPctBest === null ? dp : Math.max(a.deliveryPctBest, dp)
    }
    if (r.target_cpa != null) a.target_cpa = r.target_cpa
    if (r.target_roas != null) a.target_roas = r.target_roas
    const ro = r.roas != null ? Number(r.roas) : NaN
    if (Number.isFinite(ro) && spend > 0) {
      a.roasNum += ro * spend
      a.roasWt += spend
    }
    const dh = r.delivery_health ? String(r.delivery_health) : null
    if (spend >= a.healthBest.spend) a.healthBest = { spend, h: dh }
  }

  return Array.from(map.values())
    .map((a) => {
      const ctr = a.impressions > 0 ? (a.clicks / a.impressions) * 100 : null
      const cpc = a.clicks > 0 ? a.spend / a.clicks : null
      const cpa = a.conversions > 0 ? a.spend / a.conversions : null
      const cpm = a.impressions > 0 ? (a.spend / a.impressions) * 1000 : null
      const roas = a.roasWt > 0 ? a.roasNum / a.roasWt : null
      const frequency = a.freqDen > 0 ? a.freqNum / a.freqDen : null
      const viewability = a.viewDen > 0 ? a.viewNum / a.viewDen : null
      const vcr = a.impressions > 0 ? (a.completed_views / a.impressions) * 100 : null
      const out: AggRow = {
        key: a.key,
        platform: a.platform,
        campaign_name: a.campaign_name,
        group_name: a.group_name,
        group_type: a.group_type,
        spend: a.spend,
        impressions: a.impressions,
        clicks: a.clicks,
        conversions: a.conversions,
        ctr,
        cpc,
        cpa,
        cpm,
        roas,
        reach: a.reach,
        frequency,
        viewable_impressions: a.viewable_impressions,
        viewability,
        completed_views: a.completed_views,
        vcr,
        delivery_pct: a.deliveryPctBest,
        target_cpa: a.target_cpa,
        target_roas: a.target_roas,
        delivery_health: a.healthBest.h,
      }
      return out
    })
    .sort((x, y) => y.spend - x.spend)
}

function formatDeliveryMetric(a: AggRow, col: PerformanceColumnKey): string {
  switch (col) {
    case "impressions":
      return a.impressions.toLocaleString()
    case "reach":
      return a.reach.toLocaleString()
    case "frequency":
      return a.frequency != null && Number.isFinite(a.frequency) ? a.frequency.toFixed(2) : "—"
    case "viewable_impressions":
      return a.viewable_impressions.toLocaleString()
    case "viewability":
      return a.viewability != null && Number.isFinite(a.viewability) ? formatPacingPct1(a.viewability) : "—"
    case "clicks":
      return a.clicks.toLocaleString()
    case "ctr":
      return a.ctr != null ? formatPacingPct1(a.ctr) : "—"
    case "cpc":
      return a.cpc != null ? formatPacingAud(a.cpc) : "—"
    case "cpm":
      return a.cpm != null ? formatPacingAud(a.cpm) : "—"
    case "conversions":
      return a.conversions.toLocaleString()
    case "cpa":
      return a.cpa != null ? formatPacingAud(a.cpa) : "—"
    case "roas":
      return a.roas != null && Number.isFinite(a.roas) ? a.roas.toFixed(2) : "—"
    case "completed_views":
      return a.completed_views.toLocaleString()
    case "vcr":
      return a.vcr != null ? formatPacingPct1(a.vcr) : "—"
    case "delivery_pct":
      return a.delivery_pct != null && Number.isFinite(a.delivery_pct) ? formatPacingPct1(a.delivery_pct) : "—"
    default:
      return "—"
  }
}

function bidLabel(a: AggRow): string {
  if (a.target_cpa != null && Number.isFinite(a.target_cpa)) return `tCPA ${formatPacingAud(a.target_cpa)}`
  if (a.target_roas != null && Number.isFinite(a.target_roas)) return `tROAS ${a.target_roas.toFixed(2)}`
  return "—"
}

export function DeliveryPacingDrawer({
  row,
  open,
  onOpenChange,
  filterDateTo,
  clientLabel,
}: {
  row: LineItemPacingRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
  filterDateTo: string
  clientLabel: string
}) {
  const [delivery, setDelivery] = useState<DeliveryPacingRow[]>([])
  const [history30, setHistory30] = useState<LineItemPacingDailyPoint[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open || !row) return
    let cancelled = false
    setBusy(true)
    setDelivery([])
    setHistory30([])
    void (async () => {
      try {
        const [dRes, hRes] = await Promise.all([
          fetchPacingDelivery({ av_line_item_id: row.av_line_item_id }),
          fetchPacingLineItemHistory(row.av_line_item_id, { days: 30 }),
        ])
        if (cancelled) return
        setDelivery(Array.isArray(dRes.data) ? dRes.data : [])
        setHistory30(Array.isArray(hRes.data) ? hRes.data : [])
      } catch {
        if (!cancelled) {
          setDelivery([])
          setHistory30([])
        }
      } finally {
        if (!cancelled) setBusy(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, row?.av_line_item_id])

  const derived = useMemo(
    () => (row ? computeLineItemPacingDerived(row, filterDateTo) : null),
    [row, filterDateTo]
  )

  const budget = Number(row?.budget_amount ?? 0)

  const aggRows = useMemo(() => aggregateDelivery(delivery), [delivery])

  const perfCols = useMemo(
    () => getMediaTypeConfig(row?.media_type).performanceColumns,
    [row?.media_type]
  )

  const trendData = useMemo(() => {
    const sorted = [...history30].sort((a, b) => a.delivery_date.localeCompare(b.delivery_date))
    let cum = 0
    const expectedTotal = Number(row?.expected_spend ?? row?.budget_amount ?? 0)
    const n = sorted.length
    return sorted.map((p, i) => {
      cum += Number(p.spend ?? 0)
      const expectedCum = n > 0 && expectedTotal > 0 ? (expectedTotal * (i + 1)) / n : (cum * (i + 1)) / Math.max(1, i + 1)
      return {
        date: p.delivery_date.slice(0, 10),
        actual: cum,
        expected: expectedCum,
      }
    })
  }, [history30, row?.expected_spend, row?.budget_amount])

  const todayYmd = format(new Date(), "yyyy-MM-dd")
  const todayIdx = trendData.findIndex((d) => d.date >= todayYmd)

  const perfRows = useMemo(() => {
    const asc = [...history30].sort((a, b) => a.delivery_date.localeCompare(b.delivery_date))
    let prevSpend: number | null = null
    const rowsAsc = asc.map((p) => {
      const spend = Number(p.spend ?? 0)
      const dod =
        prevSpend != null && prevSpend !== 0 ? ((spend - prevSpend) / Math.abs(prevSpend)) * 100 : null
      prevSpend = spend
      return {
        date: p.delivery_date.slice(0, 10),
        spend,
        impr: Number(p.impressions ?? 0),
        clicks: Number(p.clicks ?? 0),
        conv: Number(p.conversions ?? 0),
        dod,
      }
    })
    return rowsAsc.slice().reverse()
  }, [history30])

  if (!row) return null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <SheetHeader className="space-y-3 border-b border-border/60 px-6 py-4 text-left">
          <div className="flex flex-wrap items-start justify-between gap-2 pr-8">
            <div>
              <SheetTitle className="text-lg leading-snug">
                {row.av_line_item_label || row.av_line_item_id}
              </SheetTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                {[clientLabel, row.media_type].filter(Boolean).join(" · ")}
              </p>
            </div>
            <StatusPill {...pacingStatusForStatusPill(row.pacing_status)} />
          </div>
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <span className="text-muted-foreground">Budget</span>
              <div className="font-semibold tabular-nums">{formatPacingAud(row.budget_amount)}</div>
            </div>
            <div>
              <span className="text-muted-foreground">Dates</span>
              <div className="tabular-nums text-xs">
                {formatPacingDate(row.start_date)} – {formatPacingDate(row.end_date)}
              </div>
            </div>
          </div>
          {derived ? (
            <div className="rounded-lg border border-border/60 bg-muted/30 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Pacing
              </p>
              <div className="mt-1 flex flex-wrap gap-x-6 gap-y-1">
                <div>
                  <span className="text-muted-foreground">Required / day</span>
                  <div className="text-lg font-semibold tabular-nums text-red-600 dark:text-red-400">
                    {formatPacingAud(derived.requiredDaily)}
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground">Current / day</span>
                  <div className="text-lg font-semibold tabular-nums">{formatPacingAud(derived.dailyPace)}</div>
                </div>
              </div>
            </div>
          ) : null}
        </SheetHeader>

        <Tabs defaultValue="delivery" className="flex min-h-0 flex-1 flex-col">
          <TabsList className="mx-6 mt-2 w-auto justify-start rounded-none border-b border-border/60 bg-transparent p-0">
            <TabsTrigger value="delivery" className="rounded-none border-b-2 border-transparent px-3 py-2 data-[state=active]:border-primary">
              Delivery breakdown
            </TabsTrigger>
            <TabsTrigger value="trend" className="rounded-none border-b-2 border-transparent px-3 py-2 data-[state=active]:border-primary">
              Spend trend
            </TabsTrigger>
            <TabsTrigger value="perf" className="rounded-none border-b-2 border-transparent px-3 py-2 data-[state=active]:border-primary">
              Performance
            </TabsTrigger>
          </TabsList>
          <TabsContent value="delivery" className="m-0 flex min-h-0 flex-1 flex-col overflow-hidden data-[state=inactive]:hidden">
            <ScrollArea className="h-[50vh] min-h-[280px] px-6 py-4">
              {busy ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Platform</TableHead>
                      <TableHead>Campaign</TableHead>
                      <TableHead>Group</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Spend</TableHead>
                      <TableHead className="text-right">Share</TableHead>
                      <TableHead className="text-right">Budget</TableHead>
                      {perfCols.map((col) => (
                        <TableHead key={col} className="text-right">
                          {PERFORMANCE_COLUMN_LABELS[col]}
                        </TableHead>
                      ))}
                      <TableHead>Bid</TableHead>
                      <TableHead>Health</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(() => {
                      const total = aggRows.reduce((s, a) => s + a.spend, 0)
                      return aggRows.map((a) => (
                        <TableRow key={a.key}>
                          <TableCell className="whitespace-nowrap">{a.platform}</TableCell>
                          <TableCell className="max-w-[140px] truncate">{a.campaign_name}</TableCell>
                          <TableCell className="max-w-[120px] truncate">{a.group_name}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{a.group_type}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatPacingAud(a.spend)}</TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            {total > 0 ? formatPacingPct1((a.spend / total) * 100) : "—"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            {budget > 0 && total > 0
                              ? formatPacingAud(budget * (a.spend / total))
                              : "—"}
                          </TableCell>
                          {perfCols.map((col) => (
                            <TableCell key={col} className="text-right tabular-nums text-xs">
                              {formatDeliveryMetric(a, col)}
                            </TableCell>
                          ))}
                          <TableCell className="text-xs">{bidLabel(a)}</TableCell>
                          <TableCell>
                            <DeliveryHealthBadge health={a.delivery_health} />
                          </TableCell>
                        </TableRow>
                      ))
                    })()}
                  </TableBody>
                </Table>
              )}
            </ScrollArea>
          </TabsContent>
          <TabsContent value="trend" className="m-0 flex min-h-0 flex-1 flex-col px-6 py-4 data-[state=inactive]:hidden">
            <div className="h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} minTickGap={24} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => formatPacingAud(Number(v))} width={56} />
                  <Tooltip
                    formatter={(val: number, name: string) => [formatPacingAud(val), name]}
                    labelFormatter={(l) => formatPacingDate(String(l))}
                  />
                  {todayIdx >= 0 && trendData[todayIdx]?.date ? (
                    <ReferenceLine x={trendData[todayIdx]!.date} stroke="hsl(var(--primary))" strokeDasharray="4 4" />
                  ) : null}
                  <Line type="monotone" dataKey="expected" name="Expected" stroke="hsl(var(--muted-foreground))" dot={false} />
                  <Line type="monotone" dataKey="actual" name="Actual" stroke="hsl(var(--primary))" dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </TabsContent>
          <TabsContent value="perf" className="m-0 flex min-h-0 flex-1 flex-col overflow-hidden data-[state=inactive]:hidden">
            <ScrollArea className="h-[50vh] min-h-[280px] px-6 py-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Spend</TableHead>
                    <TableHead className="text-right">DoD %</TableHead>
                    <TableHead className="text-right">Impr.</TableHead>
                    <TableHead className="text-right">Clicks</TableHead>
                    <TableHead className="text-right">Conv</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {perfRows.map((r) => (
                    <TableRow key={r.date}>
                      <TableCell className="tabular-nums">{formatPacingDate(r.date)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatPacingAud(r.spend)}</TableCell>
                      <TableCell className="text-right tabular-nums text-xs text-muted-foreground">
                        {r.dod != null ? formatPacingPct1(r.dod) : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{r.impr.toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.clicks.toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.conv.toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </TabsContent>
        </Tabs>

        <SheetFooter className="mt-auto border-t border-border/60 px-6 py-4 sm:justify-start">
          <Button type="button" variant="secondary" asChild>
            <Link href={`/pacing/mappings?av_line_item_id=${encodeURIComponent(row.av_line_item_id)}`}>
              Open mapping
            </Link>
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
