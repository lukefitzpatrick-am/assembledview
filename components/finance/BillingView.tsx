"use client"

import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react"
import { ChevronDown, ChevronRight, Inbox } from "lucide-react"
import { BillingEditPanel } from "@/components/finance/BillingEditPanel"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatMoney } from "@/lib/utils/money"
import type { BillingRecord, BillingStatus } from "@/lib/types/financeBilling"
import { useFinanceStore } from "@/lib/finance/useFinanceStore"

export interface FinanceHubFilterState {
  selectedClients: string[]
  rangeMode: "single" | "range"
  monthFrom: string
  monthTo: string
  billingType: "all" | "media" | "sow" | "retainers"
  statusFilter: "all" | BillingStatus
}

type ClientGroup = { clientName: string; records: BillingRecord[]; total: number }

function billingTypeBadgeClass(type: BillingRecord["billing_type"]) {
  if (type === "media") return "bg-blue-500/15 text-blue-700"
  if (type === "sow") return "bg-violet-500/15 text-violet-700"
  return "bg-green-500/15 text-green-700"
}

function statusBadgeClass(status: BillingRecord["status"]) {
  if (status === "draft") return "bg-muted text-muted-foreground"
  if (status === "booked") return "bg-blue-500/15 text-blue-700"
  if (status === "approved") return "bg-green-500/15 text-green-700"
  if (status === "invoiced") return "bg-amber-500/15 text-amber-700"
  if (status === "paid") return "bg-emerald-500/15 text-emerald-700"
  return "bg-rose-500/15 text-rose-700"
}

export function BillingView() {
  const records = useFinanceStore((s) => s.billingRecords)
  const loading = useFinanceStore((s) => s.billingLoading)
  const error = useFinanceStore((s) => s.billingError)
  const [openClients, setOpenClients] = useState<string[]>([])
  const [expandedRecords, setExpandedRecords] = useState<Set<number>>(new Set())
  const [selectedRecord, setSelectedRecord] = useState<BillingRecord | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [focusedRecordId, setFocusedRecordId] = useState<number | null>(null)
  const previousStatusRef = useRef<Map<number, BillingRecord["status"]>>(new Map())
  const [flashingStatuses, setFlashingStatuses] = useState<Set<number>>(new Set())

  useEffect(() => {
    const nextFlash = new Set<number>()
    for (const record of records) {
      const prev = previousStatusRef.current.get(record.id)
      if (prev && prev !== record.status && record.status === "approved") nextFlash.add(record.id)
      previousStatusRef.current.set(record.id, record.status)
    }
    if (nextFlash.size > 0) {
      setFlashingStatuses(nextFlash)
      const t = setTimeout(() => setFlashingStatuses(new Set()), 900)
      return () => clearTimeout(t)
    }
  }, [records])

  const groups = useMemo<ClientGroup[]>(() => {
    const map = new Map<string, BillingRecord[]>()
    for (const record of records) {
      const key = record.client_name || "Unknown client"
      const list = map.get(key)
      if (list) list.push(record)
      else map.set(key, [record])
    }
    return Array.from(map.entries())
      .map(([clientName, grouped]) => ({
        clientName,
        records: grouped,
        total: grouped.reduce((sum, rec) => sum + Number(rec.total || 0), 0),
      }))
      .sort((a, b) => a.clientName.localeCompare(b.clientName))
  }, [records])

  useEffect(() => {
    if (groups.length === 0) {
      setOpenClients([])
      return
    }
    if (groups.length <= 5) {
      setOpenClients(groups.map((g) => g.clientName))
    } else {
      setOpenClients([])
    }
  }, [groups])

  const visibleRecordOrder = useMemo(
    () =>
      groups
        .filter((g) => openClients.includes(g.clientName))
        .flatMap((g) => g.records)
        .map((r) => r.id),
    [groups, openClients]
  )

  const grandTotal = useMemo(() => groups.reduce((sum, g) => sum + g.total, 0), [groups])

  const toggleClient = (clientName: string) => {
    setOpenClients((prev) =>
      prev.includes(clientName) ? prev.filter((name) => name !== clientName) : [...prev, clientName]
    )
  }

  const toggleRecordExpanded = (recordId: number) => {
    setExpandedRecords((prev) => {
      const next = new Set(prev)
      if (next.has(recordId)) next.delete(recordId)
      else next.add(recordId)
      return next
    })
  }

  const handleRecordKeyDown = (recordId: number, event: KeyboardEvent<HTMLButtonElement>) => {
    const currentIndex = visibleRecordOrder.findIndex((id) => id === recordId)
    if (currentIndex < 0) return
    if (event.key === "ArrowDown") {
      event.preventDefault()
      const nextId = visibleRecordOrder[Math.min(currentIndex + 1, visibleRecordOrder.length - 1)]
      if (nextId) setFocusedRecordId(nextId)
    }
    if (event.key === "ArrowUp") {
      event.preventDefault()
      const prevId = visibleRecordOrder[Math.max(currentIndex - 1, 0)]
      if (prevId) setFocusedRecordId(prevId)
    }
  }

  useEffect(() => {
    if (focusedRecordId == null) return
    const el = document.querySelector<HTMLButtonElement>(`[data-record-id="${focusedRecordId}"]`)
    el?.focus()
  }, [focusedRecordId])

  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, groupIdx) => (
          <Card key={groupIdx} className="overflow-hidden border-border/40 shadow-sm">
            <div className="h-1 bg-gradient-to-r from-primary via-primary/70 to-primary/40" />
            <CardContent className="space-y-3 py-4">
              <Skeleton className="h-6 w-64" />
              {Array.from({ length: 2 }).map((__, recIdx) => (
                <div key={recIdx} className="rounded-md border border-border/40 p-3">
                  <Skeleton className="h-5 w-full" />
                  <Skeleton className="mt-2 h-4 w-40" />
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <Card className="border-border/40 shadow-sm">
        <CardContent className="py-10 text-sm text-destructive">{error}</CardContent>
      </Card>
    )
  }

  if (groups.length === 0) {
    return (
      <Card className="border-border/40 shadow-sm">
        <CardContent className="py-12 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Inbox className="h-4 w-4" />
            <span>No billing records match your filters. Try adjusting the client, month, or billing type filters above.</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => {
        const isOpen = openClients.includes(group.clientName)
        return (
          <Card key={group.clientName} className="overflow-hidden border-border/40 shadow-sm">
            <div className="h-1 bg-gradient-to-r from-primary via-primary/70 to-primary/40" />
            <button
              type="button"
              onClick={() => toggleClient(group.clientName)}
              className="flex w-full items-center justify-between border-l-[3px] border-l-primary/30 bg-muted/30 px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div>
                <div className="text-sm font-semibold">{group.clientName}</div>
                <div className="text-xs text-muted-foreground">{group.records.length} records</div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold">
                  {formatMoney(group.total, {
                    locale: "en-AU",
                    currency: "AUD",
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
                {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </div>
            </button>

            {isOpen && (
              <CardContent className="space-y-3 py-4">
                {group.records.map((record) => {
                  const showItems = expandedRecords.has(record.id)
                  return (
                    <div
                      key={record.id}
                      className="rounded-lg border border-border/40 bg-background transition-colors duration-150 hover:bg-muted/10"
                    >
                      <button
                        type="button"
                        data-record-id={record.id}
                        onKeyDown={(e) => handleRecordKeyDown(record.id, e)}
                        onClick={() => {
                          setSelectedRecord(record)
                          setPanelOpen(true)
                        }}
                        className="flex w-full items-start justify-between gap-4 px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <div className="space-y-2">
                          <div className="text-sm font-semibold">{record.campaign_name || "Untitled campaign"}</div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs text-muted-foreground">{record.mba_number || "No MBA"}</span>
                            <Badge className={billingTypeBadgeClass(record.billing_type)}>
                              {record.billing_type.toUpperCase()}
                            </Badge>
                            <Badge
                              className={`${statusBadgeClass(record.status)} transition-colors duration-150 ${
                                flashingStatuses.has(record.id) ? "bg-green-500/25" : ""
                              }`}
                            >
                              {record.status}
                            </Badge>
                            {record.has_pending_edits && <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-semibold">
                            {formatMoney(record.total, {
                              locale: "en-AU",
                              currency: "AUD",
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </div>
                          <div className="mt-2">
                            <button
                              type="button"
                              className="text-xs text-muted-foreground underline underline-offset-2"
                              onClick={(e) => {
                                e.stopPropagation()
                                toggleRecordExpanded(record.id)
                              }}
                            >
                              {showItems ? "Hide line items" : "Show line items"}
                            </button>
                          </div>
                        </div>
                      </button>

                      {showItems && (
                        <div className="border-t border-border/40 px-4 pb-4">
                          <div className="overflow-x-auto">
                          <Table aria-label="Billing line items table">
                            <TableHeader>
                              <TableRow>
                                <TableHead scope="col" className="sticky left-0 bg-background">Item Code</TableHead>
                                <TableHead scope="col">Type</TableHead>
                                <TableHead scope="col">Description</TableHead>
                                <TableHead scope="col">Publisher</TableHead>
                                <TableHead scope="col" className="text-right">Amount</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {record.line_items
                                .slice()
                                .sort((a, b) => a.sort_order - b.sort_order)
                                .map((item) => (
                                  <TableRow key={item.id} className="transition-colors duration-150 hover:bg-muted/20">
                                    <TableCell className="sticky left-0 bg-background">{item.item_code}</TableCell>
                                    <TableCell>{item.line_type}</TableCell>
                                    <TableCell>{item.description || item.media_type || "N/A"}</TableCell>
                                    <TableCell>{item.publisher_name || "N/A"}</TableCell>
                                    <TableCell className="text-right">
                                      {formatMoney(item.amount, {
                                        locale: "en-AU",
                                        currency: "AUD",
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                      })}
                                    </TableCell>
                                  </TableRow>
                                ))}
                            </TableBody>
                          </Table>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </CardContent>
            )}
          </Card>
        )
      })}

      <Card className="overflow-hidden border-border/40 shadow-sm">
        <div className="border-t border-primary/20 bg-gradient-to-r from-primary/5 to-primary/10 px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">Grand total (visible records)</span>
            <span className="text-lg font-bold">
              {formatMoney(grandTotal, {
                locale: "en-AU",
                currency: "AUD",
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          </div>
        </div>
      </Card>

      <BillingEditPanel open={panelOpen} onOpenChange={setPanelOpen} record={selectedRecord} />
    </div>
  )
}
