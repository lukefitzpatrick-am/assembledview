"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { ChevronDown, Download, Loader2 } from "lucide-react"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/components/ui/use-toast"
import {
  publisherLabelForFinanceGrouping,
  recordMatchesPublisherNameFilter,
  sumPayableLineItems,
} from "@/lib/finance/aggregatePayablesPublisherGroups"
import {
  mediaTypeBadgeClass,
  publisherAccentColour,
  publisherInitials,
} from "@/lib/finance/cardHelpers"
import { fetchFinancePayablesForMonths, type FinanceBillingQuery } from "@/lib/finance/api"
import { exportPayablesPublisherDetailExcel } from "@/lib/finance/export"
import { formatLineItemDescription } from "@/lib/finance/lineItemDescription"
import { usePayablesHideClientPaid } from "@/components/finance/usePayablesHideClientPaid"
import { getCurrentAndNextBillingMonths } from "@/lib/finance/utils"
import { expandMonthRange } from "@/lib/finance/monthRange"
import type { BillingLineItem, BillingRecord } from "@/lib/types/financeBilling"
import type { Publisher } from "@/lib/types/publisher"
import { formatMoney } from "@/lib/utils/money"
import { cn } from "@/lib/utils"
import { useFinanceStore } from "@/lib/finance/useFinanceStore"

function stablePublisherNumericId(name: string): number {
  let h = 2166136261
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i)!
    h = Math.imul(h, 16777619)
  }
  const x = h | 0
  return x === 0 ? 1 : x
}

function lineIsClientPaid(li: BillingLineItem): boolean {
  return li.client_pays_media === true || (li as { clientPaysForMedia?: boolean }).clientPaysForMedia === true
}

function countVisibleLinesInRecord(record: BillingRecord, hideClientPaidLines: boolean): number {
  let n = 0
  for (const li of record.line_items || []) {
    if (Number(li.amount || 0) <= 0) continue
    if (hideClientPaidLines && lineIsClientPaid(li)) continue
    n++
  }
  return n
}

function pickRepresentativeLineForBadge(record: BillingRecord): BillingLineItem | null {
  const positive = [...(record.line_items || [])].filter((li) => Number(li.amount) > 0)
  if (positive.length === 0) return null
  const agency = positive.filter((li) => !lineIsClientPaid(li))
  const pool = agency.length > 0 ? agency : positive
  return pool.reduce((best, li) => (Number(li.amount) > Number(best.amount) ? li : best), pool[0]!)
}

function monthLabelForExport(from: string, to: string): string {
  if (from === to) return from
  return `${from}–${to}`
}

function filterPayablesByPublisherIds(
  records: BillingRecord[],
  selectedIds: number[],
  idToName: Map<number, string>
): BillingRecord[] {
  if (selectedIds.length === 0) return records
  const want = new Set(selectedIds.map((id) => (idToName.get(id) || "").trim()).filter(Boolean))
  if (want.size === 0) return records
  return records.filter((r) => recordMatchesPublisherNameFilter(r, want))
}

type PayableCampaignGroup = {
  record: BillingRecord
  totalAgency: number
  representativeLine: BillingLineItem | null
}

type PublisherPayableGroup = {
  publisherName: string
  publisherNumericId: number
  campaigns: PayableCampaignGroup[]
  totalExpected: number
}

type PayableMonthGroup = {
  monthIso: string
  monthLabel: string
  publishers: PublisherPayableGroup[]
  totalExpected: number
}

function buildCampaignGroup(record: BillingRecord): PayableCampaignGroup {
  return {
    record,
    totalAgency: sumPayableLineItems(record),
    representativeLine: pickRepresentativeLineForBadge(record),
  }
}

function buildPayableMonthGroups(
  records: BillingRecord[],
  publisherNameToId: Map<string, number>
): PayableMonthGroup[] {
  const payableOnly = records.filter((r) => r.billing_type === "payable")
  const byMonth = new Map<string, BillingRecord[]>()
  for (const r of payableOnly) {
    const m = r.billing_month
    if (!byMonth.has(m)) byMonth.set(m, [])
    byMonth.get(m)!.push(r)
  }

  const out: PayableMonthGroup[] = []
  for (const [monthIso, monthRecords] of byMonth.entries()) {
    const byPub = new Map<string, BillingRecord[]>()
    for (const r of monthRecords) {
      const pub = publisherLabelForFinanceGrouping(r)
      if (!byPub.has(pub)) byPub.set(pub, [])
      byPub.get(pub)!.push(r)
    }

    const publishers: PublisherPayableGroup[] = [...byPub.entries()]
      .sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: "base" }))
      .map(([publisherName, camps]) => {
        const sorted = [...camps].sort((a, b) =>
          (a.campaign_name || "").localeCompare(b.campaign_name || "", undefined, { sensitivity: "base" })
        )
        const campaigns = sorted.map(buildCampaignGroup)
        const totalExpected = campaigns.reduce((s, c) => s + c.totalAgency, 0)
        const resolvedId = publisherNameToId.get(publisherName.trim()) ?? stablePublisherNumericId(publisherName)
        return { publisherName, publisherNumericId: resolvedId, campaigns, totalExpected }
      })

    const monthDate = new Date(`${monthIso}-01T00:00:00`)
    const monthLabel = monthDate.toLocaleString("en-AU", { month: "long", year: "numeric" })
    const totalExpected = publishers.reduce((s, p) => s + p.totalExpected, 0)
    out.push({ monthIso, monthLabel, publishers, totalExpected })
  }

  out.sort((a, b) => a.monthIso.localeCompare(b.monthIso))
  return out
}

function useFinanceHubPayablesData(): {
  loading: boolean
  visibleMonthGroups: PayableMonthGroup[]
  flatFilteredRecords: BillingRecord[]
} {
  const filters = useFinanceStore((s) => s.filters)
  const [records, setRecords] = useState<BillingRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [publishers, setPublishers] = useState<Publisher[]>([])

  const [currentMonth, nextMonth] = useMemo(() => getCurrentAndNextBillingMonths(), [])

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/publishers")
        if (!res.ok) return
        const data = (await res.json()) as unknown
        setPublishers(Array.isArray(data) ? (data as Publisher[]) : [])
      } catch {
        setPublishers([])
      }
    })()
  }, [])

  const publisherNameToId = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of publishers) {
      const n = (p.publisher_name || "").trim()
      if (n && !m.has(n)) m.set(n, p.id)
    }
    return m
  }, [publishers])

  const publisherIdToName = useMemo(() => {
    const m = new Map<number, string>()
    for (const p of publishers) {
      const n = (p.publisher_name || "").trim()
      if (n) m.set(p.id, n)
    }
    return m
  }, [publishers])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const params: Omit<FinanceBillingQuery, "billing_month"> = {}
    if (!filters.includeDrafts) params.include_drafts = false
    if (filters.selectedClients.length) params.clients_id = filters.selectedClients.join(",")
    if (filters.selectedPublishers.length) params.publishers_id = filters.selectedPublishers.join(",")
    if (filters.searchQuery.trim()) params.search = filters.searchQuery.trim()
    if (filters.billingTypes.length) {
      const allowed = new Set<BillingRecord["billing_type"]>(["payable"])
      const intersection = filters.billingTypes.filter((t) => allowed.has(t))
      if (intersection.length) params.billing_type = intersection.join(",")
    }
    if (filters.statuses.length) params.status = filters.statuses.join(",")

    void fetchFinancePayablesForMonths([currentMonth, nextMonth], params)
      .then((rows) => {
        if (!cancelled) setRecords(rows.filter((r) => r.billing_type === "payable"))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [
    currentMonth,
    nextMonth,
    filters.includeDrafts,
    filters.selectedClients,
    filters.selectedPublishers,
    filters.searchQuery,
    filters.billingTypes,
    filters.statuses,
  ])

  const filtered = useMemo(() => {
    let list = records
    const q = filters.searchQuery.trim().toLowerCase()
    if (q) {
      list = list.filter((r) => {
        const hay = [
          r.client_name,
          r.mba_number,
          r.campaign_name,
          r.billing_month,
          r.status,
          ...(r.line_items || []).map((li) => [li.publisher_name, li.media_type, li.description].join(" ")),
        ]
          .join(" ")
          .toLowerCase()
        return hay.includes(q)
      })
    }
    return filterPayablesByPublisherIds(list, filters.selectedPublishers, publisherIdToName)
  }, [records, filters.searchQuery, filters.selectedPublishers, publisherIdToName])

  const monthGroups = useMemo(
    () => buildPayableMonthGroups(filtered, publisherNameToId),
    [filtered, publisherNameToId]
  )

  const visibleMonthGroups = useMemo(() => {
    const allowed = new Set(expandMonthRange(filters.monthRange))
    return monthGroups.filter((g) => allowed.has(g.monthIso))
  }, [monthGroups, filters.monthRange])

  return {
    loading,
    visibleMonthGroups,
    flatFilteredRecords: filtered,
  }
}

function PayableInvoiceCard({
  group,
  hideClientPaidLines,
}: {
  group: PayableCampaignGroup
  hideClientPaidLines: boolean
}) {
  const { record, totalAgency, representativeLine } = group
  const rep = representativeLine
  const channelLabelBadge = rep ? formatLineItemDescription(rep).channelLabel : "Unknown"

  const sortedLines = [...(record.line_items || [])].sort((a, b) => a.sort_order - b.sort_order)

  return (
    <article className="overflow-hidden rounded-md border border-border/60">
      <div className="flex items-start justify-between gap-3 bg-muted/40 px-3 py-2.5">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{record.campaign_name || "—"}</p>
          <p className="truncate text-[11px] tabular-nums text-muted-foreground">
            {(record.client_name || "—") + (record.mba_number ? ` · ${record.mba_number}` : "")}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Badge
            variant="secondary"
            className={cn(
              "text-[10px] font-semibold uppercase",
              mediaTypeBadgeClass(rep?.media_type || "")
            )}
          >
            {channelLabelBadge}
          </Badge>
          <p className="text-sm font-semibold tabular-nums">{formatMoney(totalAgency)}</p>
        </div>
      </div>
      <div className="px-3 py-1">
        {sortedLines.length === 0 ? (
          <p className="py-2 text-xs text-muted-foreground">No line items</p>
        ) : (
          sortedLines
            .filter((li) => !hideClientPaidLines || !lineIsClientPaid(li))
            .map((li, liIdx) => {
            const isClientPaid = lineIsClientPaid(li)
            const { primary, channelLabel } = formatLineItemDescription(li)
            return (
              <div
                key={`li-${liIdx}-${li.sort_order}-${li.item_code}`}
                className={cn(
                  "flex items-start justify-between gap-3 border-b border-border/40 py-2 last:border-0",
                  isClientPaid && "opacity-60"
                )}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1">
                    <p className="truncate text-xs text-foreground">{primary}</p>
                    {isClientPaid ? (
                      <Badge className="bg-muted text-muted-foreground text-[10px] font-normal hover:bg-muted">
                        Client paid direct
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                    {channelLabel}
                  </p>
                </div>
                <p className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {isClientPaid ? (
                    <span className="line-through tabular-nums">{formatMoney(li.amount)}</span>
                  ) : (
                    formatMoney(li.amount)
                  )}
                </p>
              </div>
            )
          })
        )}
      </div>
    </article>
  )
}

export default function FinanceHubPayablesSection() {
  const [hideClientPaidLines, setHideClientPaidLines] = usePayablesHideClientPaid()
  const filters = useFinanceStore((s) => s.filters)
  const { loading, visibleMonthGroups, flatFilteredRecords } = useFinanceHubPayablesData()
  const { toast } = useToast()

  const handleExportExcel = useCallback(async () => {
    try {
      const flat = visibleMonthGroups.flatMap((mg) => mg.publishers.flatMap((p) => p.campaigns.map((c) => c.record)))
      const label = monthLabelForExport(filters.monthRange.from, filters.monthRange.to)
      await exportPayablesPublisherDetailExcel(flat, label, "Payables")
      toast({ title: "Exported", description: "Publisher layout workbook downloaded." })
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Export failed",
        description: e instanceof Error ? e.message : "Unknown error",
      })
    }
  }, [filters.monthRange.from, filters.monthRange.to, toast, visibleMonthGroups])

  const emptyCopy = (
    <p className="py-10 text-sm text-muted-foreground">
      No payable rows for the current filters and billing months in view.
    </p>
  )

  return (
    <div className="relative space-y-4">
      {loading ? (
        <div className="pointer-events-none absolute inset-x-0 -top-1 h-0.5 overflow-hidden">
          <div className="h-full w-1/3 animate-pulse bg-primary" />
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-4">
        <div className="flex items-center gap-2">
          <Switch
            id="payables-hide-client-paid-hub"
            checked={hideClientPaidLines}
            onCheckedChange={(v) => setHideClientPaidLines(Boolean(v))}
          />
          <Label htmlFor="payables-hide-client-paid-hub" className="text-xs font-normal text-muted-foreground">
            Hide client-paid lines
          </Label>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={flatFilteredRecords.length === 0}>
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => void handleExportExcel()}>
              Excel (publisher layout)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {loading && visibleMonthGroups.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
          Loading payables…
        </div>
      ) : !loading && visibleMonthGroups.length === 0 ? (
        emptyCopy
      ) : (
        <div className="space-y-8 pt-1">
          {visibleMonthGroups.map((mg) => {
            const lineItemCount = mg.publishers.reduce(
              (n, pub) =>
                n + pub.campaigns.reduce(
                  (m, cg) => m + countVisibleLinesInRecord(cg.record, hideClientPaidLines),
                  0
                ),
              0
            )
            const pubNoun = mg.publishers.length === 1 ? "publisher" : "publishers"
            const lineNoun = lineItemCount === 1 ? "line item" : "line items"

            return (
              <section key={mg.monthIso} className="space-y-4">
                <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1 border-b border-border/50 pb-2">
                  <p className="text-sm font-medium text-foreground">{mg.monthLabel}</p>
                  <div className="flex flex-wrap items-end justify-end gap-x-4">
                    <p className="text-xs text-muted-foreground">
                      {mg.publishers.length} {pubNoun} · {lineItemCount} {lineNoun}
                    </p>
                    <p className="text-xs font-medium tabular-nums text-foreground">{formatMoney(mg.totalExpected)}</p>
                  </div>
                </div>

                <div className="space-y-4">
                  {mg.publishers.map((pub) => {
                    const lineCount = pub.campaigns.reduce(
                      (n, cg) => n + countVisibleLinesInRecord(cg.record, hideClientPaidLines),
                      0
                    )
                    const lineN = lineCount === 1 ? "line item" : "line items"
                    const accent = publisherAccentColour(pub.publisherNumericId)

                    return (
                      <Collapsible key={`${mg.monthIso}-${pub.publisherName}`} defaultOpen className="group">
                        <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm">
                          <CollapsibleTrigger asChild>
                            <header className="flex w-full cursor-pointer items-center gap-3 border-b border-border/60 bg-muted/40 px-4 py-3 text-left transition-colors hover:bg-muted/55">
                              <Avatar className="h-9 w-9 rounded-full border border-border/40 shadow-sm">
                                <AvatarFallback
                                  className="text-xs font-semibold text-white"
                                  style={{ backgroundColor: accent }}
                                >
                                  {publisherInitials(pub.publisherName)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium">{pub.publisherName}</p>
                                <p className="text-xs text-muted-foreground">
                                  {lineCount} {lineN} · {mg.monthLabel}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Owed</p>
                                <p className="text-base font-semibold tabular-nums">
                                  {formatMoney(pub.totalExpected)}
                                </p>
                              </div>
                              <ChevronDown
                                className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=closed]:-rotate-90"
                                aria-hidden
                              />
                            </header>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <div className="grid gap-3 p-4 lg:grid-cols-2">
                              {pub.campaigns.map((cg, cgIdx) => (
                                <PayableInvoiceCard
                                  key={`${mg.monthIso}-${pub.publisherName}-${cg.record.id}-${cgIdx}-${cg.record.mba_number ?? ""}`}
                                  group={cg}
                                  hideClientPaidLines={hideClientPaidLines}
                                />
                              ))}
                            </div>
                          </CollapsibleContent>
                        </div>
                      </Collapsible>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
