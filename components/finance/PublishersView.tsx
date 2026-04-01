"use client"

import { useEffect, useMemo, useState } from "react"
import { Inbox } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { BillingEditPanel } from "@/components/finance/BillingEditPanel"
import type { BillingRecord } from "@/lib/types/financeBilling"
import { formatMoney } from "@/lib/utils/money"
import type { FinanceHubFilterState } from "@/components/finance/BillingView"
import { useFinanceStore } from "@/lib/finance/useFinanceStore"

const money = (n: number) =>
  formatMoney(n, {
    locale: "en-AU",
    currency: "AUD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

export type PublisherCampaignRow = {
  billingRecordId: number
  clientName: string
  mbaNumber: string
  campaignName: string
  totalMedia: number
  status: BillingRecord["status"]
  billingType: BillingRecord["billing_type"]
}

export type PublisherGroup = {
  publisherName: string
  subtotal: number
  clients: Array<{
    clientName: string
    campaigns: PublisherCampaignRow[]
  }>
}

function statusBadgeClass(status: BillingRecord["status"]) {
  if (status === "draft") return "bg-muted text-muted-foreground"
  if (status === "booked") return "bg-blue-500/15 text-blue-700"
  if (status === "approved") return "bg-green-500/15 text-green-700"
  if (status === "invoiced") return "bg-amber-500/15 text-amber-700"
  if (status === "paid") return "bg-emerald-500/15 text-emerald-700"
  return "bg-rose-500/15 text-rose-700"
}

interface PublishersViewProps {
  filters: FinanceHubFilterState
  onExportDataChange?: (payload: { publishers: PublisherGroup[]; monthLabel: string } | null) => void
}

export function PublishersView({ filters, onExportDataChange }: PublishersViewProps) {
  const loading = useFinanceStore((s) => s.billingLoading)
  const error = useFinanceStore((s) => s.billingError)
  const records = useFinanceStore((s) => s.billingRecords)
  const publishers = useMemo<PublisherGroup[]>(() => {
    const pubMap = new Map<string, PublisherGroup>()
    for (const record of records) {
      for (const line of record.line_items || []) {
        if (line.client_pays_media) continue
        const amount = Number(line.amount || 0)
        if (!amount) continue
        const publisherName = line.publisher_name || "Unspecified publisher"
        const existingPub =
          pubMap.get(publisherName) || { publisherName, subtotal: 0, clients: [] as PublisherGroup["clients"] }
        let clientGroup = existingPub.clients.find((c) => c.clientName === record.client_name)
        if (!clientGroup) {
          clientGroup = { clientName: record.client_name, campaigns: [] }
          existingPub.clients.push(clientGroup)
        }
        let campaign = clientGroup.campaigns.find((c) => c.billingRecordId === record.id)
        if (!campaign) {
          campaign = {
            billingRecordId: record.id,
            clientName: record.client_name,
            mbaNumber: record.mba_number || "",
            campaignName: record.campaign_name || "Untitled campaign",
            totalMedia: 0,
            status: record.status,
            billingType: record.billing_type,
          }
          clientGroup.campaigns.push(campaign)
        }
        campaign.totalMedia += amount
        existingPub.subtotal += amount
        pubMap.set(publisherName, existingPub)
      }
    }
    return Array.from(pubMap.values()).sort((a, b) => a.publisherName.localeCompare(b.publisherName))
  }, [records])
  const recordsMap = useMemo(() => new Map(records.map((r) => [r.id, r])), [records])
  const [selectedRecord, setSelectedRecord] = useState<BillingRecord | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)

  const monthLabel = useMemo(() => {
    if (filters.rangeMode === "range") return `${filters.monthFrom}_to_${filters.monthTo}`
    return filters.monthFrom
  }, [filters.monthFrom, filters.monthTo, filters.rangeMode])

  useEffect(() => {
    onExportDataChange?.({ publishers, monthLabel })
  }, [monthLabel, onExportDataChange, publishers])

  const grandTotal = useMemo(() => publishers.reduce((sum, pub) => sum + pub.subtotal, 0), [publishers])

  if (loading) {
    return (
      <Card className="border-border/40 shadow-sm">
        <CardContent className="py-10 text-sm text-muted-foreground">Loading publishers...</CardContent>
      </Card>
    )
  }
  if (error) {
    return (
      <Card className="border-border/40 shadow-sm">
        <CardContent className="py-10 text-sm text-destructive">{error}</CardContent>
      </Card>
    )
  }
  if (publishers.length === 0) {
    return (
      <Card className="border-border/40 shadow-sm">
        <CardContent className="py-10 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Inbox className="h-4 w-4" />
            <span>No publisher rows for current filters.</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-8">
      {publishers.map((pub) => (
        <div key={pub.publisherName} className="overflow-hidden rounded-lg border border-border/40 shadow-sm">
          <div className="bg-emerald-900 px-4 py-2 text-sm font-semibold text-emerald-50">{pub.publisherName}</div>
          <div className="overflow-x-auto">
          <Table aria-label="Publishers grouped table">
            <TableHeader>
              <TableRow className="bg-muted/80 hover:bg-muted/80">
                <TableHead scope="col" className="sticky left-0 w-[22%] bg-muted/80">Client</TableHead>
                <TableHead scope="col" className="w-[14%]">MBA number</TableHead>
                <TableHead scope="col">Campaign</TableHead>
                <TableHead scope="col">Status</TableHead>
                <TableHead scope="col" className="w-[11rem] text-right">Media</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pub.clients.flatMap((client) =>
                client.campaigns.map((camp, idx) => (
                  <TableRow
                    key={`${pub.publisherName}-${client.clientName}-${camp.billingRecordId}-${idx}`}
                    className="cursor-pointer transition-colors duration-150 hover:bg-muted/30"
                    onClick={() => {
                      const record = recordsMap.get(camp.billingRecordId)
                      if (!record) return
                      setSelectedRecord(record)
                      setPanelOpen(true)
                    }}
                  >
                    <TableCell className="sticky left-0 bg-background align-top font-medium">{client.clientName}</TableCell>
                    <TableCell className="align-top font-mono text-sm">{camp.mbaNumber}</TableCell>
                    <TableCell className="align-top">{camp.campaignName}</TableCell>
                    <TableCell>
                      <Badge className={statusBadgeClass(camp.status)}>{camp.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{money(camp.totalMedia)}</TableCell>
                  </TableRow>
                ))
              )}
              <TableRow className="border-t-2 border-emerald-200 bg-emerald-50 font-semibold">
                <TableCell colSpan={4} className="text-right">
                  Subtotal - {pub.publisherName}
                </TableCell>
                <TableCell className="text-right tabular-nums">{money(pub.subtotal)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
          </div>
        </div>
      ))}

      <div className="flex justify-end rounded-lg border-2 border-emerald-300 bg-emerald-100/80 px-4 py-3">
        <div className="text-right">
          <div className="text-sm font-medium text-emerald-900">Grand total - period</div>
          <div className="text-xl font-bold tabular-nums text-emerald-950">{money(grandTotal)}</div>
        </div>
      </div>

      <BillingEditPanel open={panelOpen} onOpenChange={setPanelOpen} record={selectedRecord} />
    </div>
  )
}
