"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { ChevronDown, ChevronRight, Download, Loader2 } from "lucide-react"
import { EditableFinanceGrid } from "@/components/finance/EditableFinanceGrid"
import type { FinanceColumnMeta } from "@/components/finance/EditableFinanceGrid"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Combobox, type ComboboxOption } from "@/components/ui/combobox"
import { useToast } from "@/components/ui/use-toast"
import {
  publisherLabelForFinanceGrouping,
  recordMatchesPublisherNameFilter,
  sumPayableLineItems,
} from "@/lib/finance/aggregatePayablesPublisherGroups"
import type { BillingRecord, BillingStatus } from "@/lib/types/financeBilling"
import type { Publisher } from "@/lib/types/publisher"
import { updateBillingRecord } from "@/lib/finance/api"
import { exportPayablesPublisherDetailExcel } from "@/lib/finance/export"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { PayablesAgencyOwedFooter, PayablesDeliveryLinesTable } from "@/components/finance/PayablesDeliveryLinesTable"
import { usePayablesHideClientPaid } from "@/components/finance/usePayablesHideClientPaid"
import { formatMoney } from "@/lib/utils/money"
import { cn } from "@/lib/utils"
import { useFinanceStore } from "@/lib/finance/useFinanceStore"

const PAYABLE_STATUS_ORDER = ["expected", "invoiced", "paid", "disputed"] as const satisfies readonly BillingStatus[]

const PAYABLE_STATUS_OPTIONS: ComboboxOption[] = PAYABLE_STATUS_ORDER.map((s) => ({
  value: s,
  label: s.charAt(0).toUpperCase() + s.slice(1),
}))

function PayablesDeliveryLinesPanel({
  record,
  hideClientPaidLines,
}: {
  record: BillingRecord
  hideClientPaidLines: boolean
}) {
  return (
    <div className="rounded-md border border-border/60 bg-background/80 p-2">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Delivery lines (this month)
      </div>
      <PayablesDeliveryLinesTable
        record={record}
        hideClientPaidLines={hideClientPaidLines}
        tableIdPrefix={`pt-${record.id}`}
      />
      <PayablesAgencyOwedFooter record={record} />
    </div>
  )
}

function monthLabelForExport(from: string, to: string): string {
  if (from === to) return from
  return `${from}–${to}`
}

function publisherOptionsForValue(
  options: ComboboxOption[],
  currentName: string
): ComboboxOption[] {
  const v = currentName.trim()
  if (!v || options.some((o) => o.value === v)) return [...options]
  return [{ value: v, label: v }, ...options]
}

function payablesStatusOptions(records: BillingRecord[]): ComboboxOption[] {
  const out: ComboboxOption[] = PAYABLE_STATUS_OPTIONS.map((o) => ({ ...o }))
  const seen = new Set(out.map((o) => o.value))
  for (const r of records) {
    const s = r.status
    if (seen.has(s)) continue
    seen.add(s)
    out.push({
      value: s,
      label: s.charAt(0).toUpperCase() + s.slice(1),
    })
  }
  return out
}

function filterPayablesByPublisherIds(
  records: BillingRecord[],
  selectedIds: number[],
  idToName: Map<number, string>
): BillingRecord[] {
  if (selectedIds.length === 0) return records
  const want = new Set(
    selectedIds.map((id) => (idToName.get(id) || "").trim()).filter(Boolean)
  )
  if (want.size === 0) return records
  return records.filter((r) => recordMatchesPublisherNameFilter(r, want))
}

export function PayablesTab() {
  const [hideClientPaidLines, setHideClientPaidLines] = usePayablesHideClientPaid()
  const filters = useFinanceStore((s) => s.filters)
  const payablesRecords = useFinanceStore((s) => s.payablesRecords)
  const payablesLoading = useFinanceStore((s) => s.payablesLoading)
  const payablesError = useFinanceStore((s) => s.payablesError)
  const setPayablesRecords = useFinanceStore((s) => s.setPayablesRecords)
  const refreshPendingDraftCount = useFinanceStore((s) => s.refreshPendingDraftCount)
  const { toast } = useToast()

  const [publishers, setPublishers] = useState<Publisher[]>([])
  const [publisherBusyId, setPublisherBusyId] = useState<number | null>(null)
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set())

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

  const publisherComboboxOptions = useMemo<ComboboxOption[]>(() => {
    return publishers
      .map((p) => ({
        value: (p.publisher_name || "").trim(),
        label: (p.publisher_name || `Publisher ${p.id}`).trim(),
      }))
      .filter((o) => o.value.length > 0)
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }))
  }, [publishers])

  const publisherIdToName = useMemo(() => {
    const m = new Map<number, string>()
    for (const p of publishers) {
      const n = (p.publisher_name || "").trim()
      if (n) m.set(p.id, n)
    }
    return m
  }, [publishers])

  const rows = useMemo(
    () => filterPayablesByPublisherIds(payablesRecords, filters.selectedPublishers, publisherIdToName),
    [payablesRecords, filters.selectedPublishers, publisherIdToName]
  )

  const replaceRecord = useCallback(
    (next: BillingRecord) => {
      setPayablesRecords(
        useFinanceStore.getState().payablesRecords.map((r) => (r.id === next.id ? next : r))
      )
    },
    [setPayablesRecords]
  )

  const onCellEdit = useCallback(
    async (recordId: number, field: string, value: unknown) => {
      const updated = await updateBillingRecord(recordId, { [field]: value } as Partial<BillingRecord>)
      replaceRecord(updated)
      await refreshPendingDraftCount()
    },
    [refreshPendingDraftCount, replaceRecord]
  )

  const handlePublisherChange = useCallback(
    async (record: BillingRecord, nextName: string) => {
      const name = nextName.trim()
      if (!name || name === publisherLabelForFinanceGrouping(record)) return
      setPublisherBusyId(record.id)
      try {
        const line_items = (record.line_items || []).map((li) => ({
          ...li,
          publisher_name: name,
        }))
        const updated = await updateBillingRecord(record.id, { line_items })
        replaceRecord(updated)
        await refreshPendingDraftCount()
      } catch (e) {
        toast({
          variant: "destructive",
          title: "Could not update publisher",
          description: e instanceof Error ? e.message : "Update failed",
        })
      } finally {
        setPublisherBusyId(null)
      }
    },
    [refreshPendingDraftCount, replaceRecord, toast]
  )

  const toggleExpand = useCallback((id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handleExportExcel = useCallback(async () => {
    const label = monthLabelForExport(filters.monthRange.from, filters.monthRange.to)
    await exportPayablesPublisherDetailExcel(rows, label, "Payables")
  }, [filters.monthRange.from, filters.monthRange.to, rows])

  const statusOptions = useMemo(() => payablesStatusOptions(rows), [rows])

  const columnMap = useMemo(() => {
    const meta = (m: FinanceColumnMeta): { finance: FinanceColumnMeta } => ({ finance: m })

    const expandCol: ColumnDef<BillingRecord, unknown> = {
      id: "__expand__",
      header: "",
      cell: ({ row }) => (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          aria-expanded={expanded.has(row.original.id)}
          aria-label={expanded.has(row.original.id) ? "Collapse delivery lines" : "Expand delivery lines"}
          onClick={() => toggleExpand(row.original.id)}
        >
          {expanded.has(row.original.id) ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </Button>
      ),
      size: 40,
    }

    const publisherCol: ColumnDef<BillingRecord, unknown> = {
      id: "publisher_name",
      header: "Publisher",
      size: 200,
      meta: meta({ kind: "text" }),
      cell: ({ row }) => {
        const r = row.original
        const v = publisherLabelForFinanceGrouping(r)
        const opts = publisherOptionsForValue(publisherComboboxOptions, v)
        return (
          <Combobox
            options={opts}
            value={v}
            onValueChange={(next) => void handlePublisherChange(r, String(next))}
            placeholder="Publisher"
            searchPlaceholder="Search publishers…"
            disabled={publisherBusyId === r.id}
            buttonClassName="h-8 w-full max-w-[220px] border-0 bg-transparent px-1 text-xs shadow-none focus-visible:ring-1"
          />
        )
      },
    }

    const clientCol: ColumnDef<BillingRecord, unknown> = {
      id: "client_name",
      accessorKey: "client_name",
      header: "Client",
      size: 160,
      meta: meta({ field: "client_name", kind: "text" }),
    }

    const mbaCol: ColumnDef<BillingRecord, unknown> = {
      id: "mba_number",
      accessorKey: "mba_number",
      header: "MBA",
      size: 120,
      meta: meta({ field: "mba_number", kind: "text" }),
      cell: ({ getValue }) => (getValue() as string | null) || "—",
    }

    const campaignCol: ColumnDef<BillingRecord, unknown> = {
      id: "campaign_name",
      accessorKey: "campaign_name",
      header: "Campaign",
      size: 200,
      meta: meta({ field: "campaign_name", kind: "text" }),
      cell: ({ getValue }) => (getValue() as string | null) || "—",
    }

    const monthCol: ColumnDef<BillingRecord, unknown> = {
      id: "billing_month",
      accessorKey: "billing_month",
      header: "Month",
      size: 96,
      meta: meta({ field: "billing_month", kind: "text" }),
    }

    const statusCol: ColumnDef<BillingRecord, unknown> = {
      id: "status",
      accessorKey: "status",
      header: "Status",
      size: 120,
      meta: meta({ field: "status", kind: "status" }),
    }

    const invoiceDateCol: ColumnDef<BillingRecord, unknown> = {
      id: "invoice_date",
      accessorKey: "invoice_date",
      header: "Invoice date",
      size: 120,
      meta: meta({ field: "invoice_date", kind: "date" }),
    }

    const expectedCol: ColumnDef<BillingRecord, unknown> = {
      id: "expected_amount",
      header: "Expected",
      size: 112,
      meta: meta({ kind: "currency" }),
      cell: ({ row }) => (
        <span className="tabular-nums">{formatMoney(sumPayableLineItems(row.original))}</span>
      ),
    }

    const actualCol: ColumnDef<BillingRecord, unknown> = {
      id: "total",
      accessorKey: "total",
      header: "Actual",
      size: 112,
      meta: meta({ field: "total", kind: "currency" }),
    }

    const varianceCol: ColumnDef<BillingRecord, unknown> = {
      id: "variance",
      header: "Variance",
      size: 112,
      meta: meta({ kind: "currency" }),
      cell: ({ row }) => {
        const expected = sumPayableLineItems(row.original)
        const actual = Number(row.original.total || 0)
        const v = Math.round((actual - expected) * 100) / 100
        return (
          <span
            className={cn(
              "tabular-nums font-medium",
              v < 0 && "text-destructive",
              v > 0 && "text-emerald-600 dark:text-emerald-400",
              v === 0 && "text-muted-foreground"
            )}
          >
            {formatMoney(v)}
          </span>
        )
      },
    }

    return {
      expandCol,
      publisherCol,
      clientCol,
      mbaCol,
      campaignCol,
      monthCol,
      statusCol,
      invoiceDateCol,
      expectedCol,
      actualCol,
      varianceCol,
    }
  }, [expanded, handlePublisherChange, publisherBusyId, publisherComboboxOptions, toggleExpand])

  const columns = useMemo(
    () => [
      columnMap.expandCol,
      columnMap.publisherCol,
      columnMap.clientCol,
      columnMap.mbaCol,
      columnMap.campaignCol,
      columnMap.monthCol,
      columnMap.statusCol,
      columnMap.invoiceDateCol,
      columnMap.expectedCol,
      columnMap.actualCol,
      columnMap.varianceCol,
    ],
    [columnMap]
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-4">
        <div className="flex items-center gap-2">
          <Switch
            id="payables-hide-client-paid"
            checked={hideClientPaidLines}
            onCheckedChange={(v) => setHideClientPaidLines(Boolean(v))}
          />
          <Label htmlFor="payables-hide-client-paid" className="text-xs font-normal text-muted-foreground">
            Hide client-paid lines
          </Label>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={rows.length === 0}>
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => void handleExportExcel()}>Excel (publisher layout)</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {payablesLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading payables…
        </div>
      ) : null}
      {payablesError ? (
        <p className="text-sm text-destructive">
          {payablesError.field
            ? `${payablesError.error} · ${payablesError.field}`
            : payablesError.error}
        </p>
      ) : null}

      {!payablesLoading && rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No payable rows for the current filters.</p>
      ) : null}

      {rows.length > 0 ? (
        <EditableFinanceGrid
          columns={columns}
          records={rows}
          onCellEdit={onCellEdit}
          groupBy="publisher_client"
          editableFields={["status", "invoice_date", "total"]}
          expandedRecordIds={expanded}
          renderDetailRow={(r) => (
            <PayablesDeliveryLinesPanel record={r} hideClientPaidLines={hideClientPaidLines} />
          )}
          statusComboboxOptions={statusOptions}
          enableStoreOptimisticSync={false}
          hideFooter
        />
      ) : null}
    </div>
  )
}
