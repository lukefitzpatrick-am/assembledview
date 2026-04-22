"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import ExcelJS from "exceljs"
import { saveAs } from "file-saver"
import { ChevronDown, ChevronRight, Download, Loader2, Save, Bookmark } from "lucide-react"
import { EditableFinanceGrid } from "@/components/finance/EditableFinanceGrid"
import type { FinanceColumnMeta } from "@/components/finance/EditableFinanceGrid"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/components/ui/use-toast"
import type { BillingLineItem, BillingRecord, BillingStatus, BillingType } from "@/lib/types/financeBilling"
import type { SavedView } from "@/lib/types/financeBilling"
import type { FinanceCampaignData, FinanceLineItem, FinanceServiceRow } from "@/lib/finance/utils"
import {
  addLineItem,
  deleteLineItem,
  fetchBillingRecords,
  fetchSavedViews,
  saveSavedView,
  updateBillingRecord,
  updateLineItem,
} from "@/lib/finance/api"
import { exportBillingRecordsCsv } from "@/lib/finance/export"
import {
  writeMediaFinanceWorksheet,
  writeRetainerFinanceWorksheet,
  writeSowFinanceWorksheet,
  workbookToXlsxBuffer,
} from "@/lib/finance/excelFinanceExport"
import { formatMoney } from "@/lib/format/money"
import { cn } from "@/lib/utils"
import { useFinanceStore } from "@/lib/finance/useFinanceStore"
import type { ComboboxOption } from "@/components/ui/combobox"

const RECEIVABLE_BILLING_TYPES = ["media", "sow", "retainer"] as const

function isReceivableBillingType(bt: BillingType): bt is (typeof RECEIVABLE_BILLING_TYPES)[number] {
  return (RECEIVABLE_BILLING_TYPES as readonly string[]).includes(bt)
}

const RECEIVABLE_STATUS_ORDER = ["draft", "booked", "approved", "invoiced", "paid"] as const satisfies readonly BillingStatus[]

const RECEIVABLE_STATUS_OPTIONS: ComboboxOption[] = RECEIVABLE_STATUS_ORDER.map((s) => ({
  value: s,
  label: s.charAt(0).toUpperCase() + s.slice(1),
}))

const DEFAULT_COLUMN_ORDER = [
  "__expand__",
  "client",
  "billing_type",
  "campaign_name",
  "billing_month",
  "status",
  "po_number",
  "invoice_date",
  "total",
] as const

const RECEIVABLES_UI_STORAGE_PREFIX = "finance-receivables-ui:"

export type ReceivablesSortState = { columnId: string; desc: boolean } | null

function billingTypeBadgeClass(type: BillingRecord["billing_type"]) {
  if (type === "media") return "bg-blue-500/15 text-blue-700 dark:text-blue-300"
  if (type === "sow") return "bg-violet-500/15 text-violet-700 dark:text-violet-300"
  return "bg-green-500/15 text-green-700 dark:text-green-300"
}

function sumLineItems(items: BillingLineItem[]): number {
  return Math.round(items.reduce((s, li) => s + Number(li.amount || 0), 0) * 100) / 100
}

function billingRecordToFinanceCampaignData(r: BillingRecord): FinanceCampaignData {
  const lineItems: FinanceLineItem[] = []
  const serviceRows: FinanceServiceRow[] = []
  for (const li of r.line_items || []) {
    if (li.line_type === "service" || li.line_type === "fee") {
      serviceRows.push({
        itemCode: li.item_code,
        service: li.description || li.media_type || li.line_type,
        amount: li.amount,
      })
    } else {
      lineItems.push({
        itemCode: li.item_code,
        mediaType: li.media_type || li.line_type,
        description: li.description || "",
        amount: li.amount,
      })
    }
  }
  const invoiceIso = r.invoice_date?.trim()
    ? r.invoice_date
    : r.billing_month
      ? `${r.billing_month}-01`
      : new Date().toISOString().slice(0, 10)
  return {
    clientName: r.client_name,
    mbaNumber: r.mba_number || "",
    poNumber: r.po_number || undefined,
    campaignName: r.campaign_name || "",
    paymentDays: r.payment_days,
    paymentTerms: r.payment_terms,
    invoiceDate: invoiceIso,
    lineItems,
    serviceRows,
    total: r.total,
  }
}

function sanitizeExcelSheetName(name: string): string {
  const t = name.replace(/[*?:/\\[\]]/g, " ").trim().slice(0, 31)
  return t.length > 0 ? t : "Sheet"
}

function usedSheetNamesTracker() {
  const used = new Map<string, number>()
  return (base: string) => {
    const s = sanitizeExcelSheetName(base)
    const n = (used.get(s) ?? 0) + 1
    used.set(s, n)
    return n === 1 ? s : sanitizeExcelSheetName(`${s} (${n})`)
  }
}

async function buildReceivablesExcelWorkbook(records: BillingRecord[]): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook()
  const nextName = usedSheetNamesTracker()
  const byClient = new Map<string, BillingRecord[]>()
  for (const r of records) {
    const k = r.client_name?.trim() || "—"
    if (!byClient.has(k)) byClient.set(k, [])
    byClient.get(k)!.push(r)
  }
  const clients = [...byClient.keys()].sort((a, b) => a.localeCompare(b))
  for (const client of clients) {
    const list = byClient.get(client) ?? []
    const media = list.filter((r) => r.billing_type === "media").map(billingRecordToFinanceCampaignData)
    if (media.length > 0) {
      await writeMediaFinanceWorksheet(workbook, nextName(`${client} — Media`), media)
    }
    const sow = list.filter((r) => r.billing_type === "sow").map(billingRecordToFinanceCampaignData)
    if (sow.length > 0) {
      await writeSowFinanceWorksheet(workbook, nextName(`${client} — SOW`), sow)
    }
    const retainers = list.filter((r) => r.billing_type === "retainer")
    for (const r of retainers) {
      const invoiceIso = r.invoice_date?.trim()
        ? r.invoice_date
        : r.billing_month
          ? `${r.billing_month}-01`
          : new Date().toISOString().slice(0, 10)
      await writeRetainerFinanceWorksheet(workbook, nextName(`${client} — Retainer ${r.mba_number || r.id}`), {
        clientName: r.client_name,
        mbaIdentifier: r.mba_number || String(r.id),
        paymentDays: r.payment_days,
        paymentTerms: r.payment_terms,
        invoiceDateIso: invoiceIso,
        monthlyRetainer: Number(r.total || 0),
      })
    }
  }
  return workbook
}

function sortValueForColumn(r: BillingRecord, columnId: string): string | number {
  switch (columnId) {
    case "client":
      return (r.client_name || "").toLowerCase()
    case "billing_type":
      return r.billing_type
    case "campaign_name":
      return (r.campaign_name || "").toLowerCase()
    case "billing_month":
      return r.billing_month
    case "status":
      return r.status
    case "po_number":
      return (r.po_number || "").toLowerCase()
    case "invoice_date":
      return r.invoice_date || ""
    case "total":
      return Number(r.total || 0)
    default:
      return ""
  }
}

function applySort(records: BillingRecord[], sort: ReceivablesSortState): BillingRecord[] {
  if (!sort) return records
  const mult = sort.desc ? -1 : 1
  return [...records].sort((a, b) => {
    const va = sortValueForColumn(a, sort.columnId)
    const vb = sortValueForColumn(b, sort.columnId)
    if (typeof va === "number" && typeof vb === "number") return (va - vb) * mult
    return String(va).localeCompare(String(vb)) * mult
  })
}

function loadReceivablesUiForView(viewId: number): { columnOrder: string[]; sort: ReceivablesSortState } | null {
  try {
    const raw = localStorage.getItem(`${RECEIVABLES_UI_STORAGE_PREFIX}${viewId}`)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { columnOrder?: string[]; sort?: ReceivablesSortState }
    return {
      columnOrder: parsed.columnOrder?.length ? parsed.columnOrder : [...DEFAULT_COLUMN_ORDER],
      sort: parsed.sort === undefined ? { columnId: "client", desc: false } : parsed.sort,
    }
  } catch {
    return null
  }
}

function persistReceivablesUiForView(viewId: number, columnOrder: string[], sort: ReceivablesSortState) {
  localStorage.setItem(
    `${RECEIVABLES_UI_STORAGE_PREFIX}${viewId}`,
    JSON.stringify({ columnOrder, sort })
  )
}

type LineItemsPanelProps = {
  record: BillingRecord
  totalOverrides: ReadonlySet<number>
  onRecordReplace: (next: BillingRecord) => void
}

function ReceivablesLineItemsPanel({
  record,
  totalOverrides,
  onRecordReplace,
}: LineItemsPanelProps) {
  const { toast } = useToast()
  const [busyId, setBusyId] = useState<number | null>(null)

  const sortedItems = useMemo(
    () => [...(record.line_items || [])].sort((a, b) => a.sort_order - b.sort_order),
    [record.line_items]
  )

  const pushUpdatedRecord = useCallback(
    async (lineItems: BillingLineItem[]) => {
      const sum = sumLineItems(lineItems)
      const nextTotal = totalOverrides.has(record.id) ? record.total : sum
      const body: Partial<BillingRecord> = {
        line_items: lineItems,
        total: nextTotal,
      }
      try {
        const updated = await updateBillingRecord(record.id, body)
        onRecordReplace(updated)
      } catch (e) {
        toast({
          variant: "destructive",
          title: "Update failed",
          description: e instanceof Error ? e.message : "Could not save line items",
        })
      }
    },
    [onRecordReplace, record.id, record.total, toast, totalOverrides]
  )

  const handleAmountBlur = async (item: BillingLineItem, raw: string) => {
    const n = Number.parseFloat(raw.replace(/[\s$,]/g, ""))
    if (!Number.isFinite(n)) {
      toast({ variant: "destructive", title: "Invalid amount", description: "Enter a number." })
      return
    }
    setBusyId(item.id)
    try {
      const li = await updateLineItem(item.id, { amount: n })
      const nextItems = record.line_items.map((x) => (x.id === li.id ? li : x))
      await pushUpdatedRecord(nextItems)
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Save failed",
        description: e instanceof Error ? e.message : "Unknown error",
      })
    } finally {
      setBusyId(null)
    }
  }

  const handleDescBlur = async (item: BillingLineItem, description: string) => {
    setBusyId(item.id)
    try {
      const li = await updateLineItem(item.id, { description: description || null })
      const nextItems = record.line_items.map((x) => (x.id === li.id ? li : x))
      await pushUpdatedRecord(nextItems)
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Save failed",
        description: e instanceof Error ? e.message : "Unknown error",
      })
    } finally {
      setBusyId(null)
    }
  }

  const handleDelete = async (item: BillingLineItem) => {
    if (!window.confirm("Remove this line item?")) return
    setBusyId(item.id)
    try {
      await deleteLineItem(item.id)
      const nextItems = record.line_items.filter((x) => x.id !== item.id)
      await pushUpdatedRecord(nextItems)
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Delete failed",
        description: e instanceof Error ? e.message : "Unknown error",
      })
    } finally {
      setBusyId(null)
    }
  }

  const handleAdd = async () => {
    const maxOrder = sortedItems.reduce((m, li) => Math.max(m, li.sort_order), 0)
    const payload: Omit<BillingLineItem, "id"> = {
      finance_billing_records_id: record.id,
      item_code: "NEW",
      line_type: "media",
      media_type: null,
      description: "",
      publisher_name: null,
      amount: 0,
      client_pays_media: false,
      sort_order: maxOrder + 1,
    }
    try {
      const created = await addLineItem(record.id, payload)
      await pushUpdatedRecord([...record.line_items, created])
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Add failed",
        description: e instanceof Error ? e.message : "Unknown error",
      })
    }
  }

  return (
    <div className="rounded-md border border-border/60 bg-background/80 p-2">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Line items
        </span>
        <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => void handleAdd()}>
          Add line
        </Button>
      </div>
      <div className="max-h-[240px] overflow-auto rounded border border-border/50">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[100px] text-xs">Code</TableHead>
              <TableHead className="text-xs">Type</TableHead>
              <TableHead className="text-xs">Description</TableHead>
              <TableHead className="w-[120px] text-right text-xs">Amount</TableHead>
              <TableHead className="w-[56px] text-xs" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-xs text-muted-foreground">
                  No line items
                </TableCell>
              </TableRow>
            ) : (
              sortedItems.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="p-1 text-xs">{item.item_code}</TableCell>
                  <TableCell className="p-1 text-xs">{item.line_type}</TableCell>
                  <TableCell className="p-1">
                    <input
                      className="h-7 w-full min-w-[120px] rounded border border-input bg-transparent px-1 text-xs"
                      defaultValue={item.description ?? ""}
                      disabled={busyId === item.id}
                      onBlur={(e) => {
                        if ((e.target.value || "") !== (item.description ?? "")) {
                          void handleDescBlur(item, e.target.value)
                        }
                      }}
                    />
                  </TableCell>
                  <TableCell className="p-1 text-right">
                    <input
                      className="h-7 w-full rounded border border-input bg-transparent px-1 text-right text-xs tabular-nums"
                      defaultValue={String(item.amount)}
                      disabled={busyId === item.id}
                      onBlur={(e) => void handleAmountBlur(item, e.target.value)}
                    />
                  </TableCell>
                  <TableCell className="p-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs text-destructive"
                      disabled={busyId === item.id}
                      onClick={() => void handleDelete(item)}
                    >
                      ×
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Computed sum: {formatMoney(sumLineItems(record.line_items))}
        {totalOverrides.has(record.id) ? " · Total may be overridden on the parent row." : ""}
      </p>
    </div>
  )
}

const EDITABLE_FIELDS = ["status", "po_number", "invoice_date", "total"] as const

export function ReceivablesTab() {
  const filters = useFinanceStore((s) => s.filters)
  const setFilters = useFinanceStore((s) => s.setFilters)
  const mergeStoreRecord = useFinanceStore((s) => s.updateBillingRecord)
  const { toast } = useToast()

  const [rows, setRows] = useState<BillingRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set())
  const [totalOverrides, setTotalOverrides] = useState<Set<number>>(() => new Set())
  const [columnOrder, setColumnOrder] = useState<string[]>(() => [...DEFAULT_COLUMN_ORDER])
  const [sort, setSort] = useState<ReceivablesSortState>({ columnId: "client", desc: false })
  const [savedViews, setSavedViews] = useState<SavedView[]>([])

  useEffect(() => {
    void (async () => {
      try {
        const list = await fetchSavedViews()
        setSavedViews(Array.isArray(list) ? list : [])
      } catch {
        setSavedViews([])
      }
    })()
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    void (async () => {
      try {
        const all = await fetchBillingRecords(filters)
        if (cancelled) return
        const next = all.filter((r) => isReceivableBillingType(r.billing_type))
        setRows(next)
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : "Failed to load receivables")
          setRows([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [filters])

  const sortedRows = useMemo(() => applySort(rows, sort), [rows, sort])

  const toggleExpand = useCallback((id: number) => {
    setExpanded((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }, [])

  const replaceRecord = useCallback((next: BillingRecord) => {
    setRows((prev) => prev.map((r) => (r.id === next.id ? next : r)))
    mergeStoreRecord(next.id, next)
  }, [mergeStoreRecord])

  const onCellEdit = useCallback(
    async (recordId: number, field: string, value: unknown) => {
      const updated = await updateBillingRecord(recordId, { [field]: value } as Partial<BillingRecord>)
      replaceRecord(updated)
      if (field === "total") {
        setTotalOverrides((s) => {
          const n = new Set(s)
          n.add(recordId)
          return n
        })
      }
    },
    [replaceRecord]
  )

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
          aria-label={expanded.has(row.original.id) ? "Collapse line items" : "Expand line items"}
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

    const clientCol: ColumnDef<BillingRecord, unknown> = {
      id: "client",
      accessorKey: "client_name",
      header: "Client",
      cell: ({ row }) => (
        <div>
          <div className="font-medium leading-tight text-foreground">{row.original.client_name}</div>
          <div className="text-[11px] text-muted-foreground tabular-nums">
            {row.original.mba_number || "—"}
          </div>
        </div>
      ),
      meta: meta({ field: "client_name", kind: "text" }),
    }

    const typeCol: ColumnDef<BillingRecord, unknown> = {
      id: "billing_type",
      accessorKey: "billing_type",
      header: "Type",
      cell: ({ row }) => (
        <Badge variant="secondary" className={cn("text-[10px] font-semibold uppercase", billingTypeBadgeClass(row.original.billing_type))}>
          {row.original.billing_type}
        </Badge>
      ),
      meta: meta({ field: "billing_type", kind: "text" }),
    }

    const campaignCol: ColumnDef<BillingRecord, unknown> = {
      id: "campaign_name",
      accessorKey: "campaign_name",
      header: "Campaign",
      cell: ({ getValue }) => <span>{(getValue() as string) || "—"}</span>,
      meta: meta({ field: "campaign_name", kind: "text" }),
    }

    const monthCol: ColumnDef<BillingRecord, unknown> = {
      id: "billing_month",
      accessorKey: "billing_month",
      header: "Month",
      cell: ({ getValue }) => <span className="tabular-nums">{(getValue() as string) || "—"}</span>,
      meta: meta({ field: "billing_month", kind: "text" }),
    }

    const statusCol: ColumnDef<BillingRecord, unknown> = {
      id: "status",
      accessorKey: "status",
      header: "Status",
      meta: meta({ field: "status", kind: "status" }),
    }

    const poCol: ColumnDef<BillingRecord, unknown> = {
      id: "po_number",
      accessorKey: "po_number",
      header: "PO #",
      meta: meta({ field: "po_number", kind: "text" }),
    }

    const invCol: ColumnDef<BillingRecord, unknown> = {
      id: "invoice_date",
      accessorKey: "invoice_date",
      header: "Invoice date",
      meta: meta({ field: "invoice_date", kind: "date" }),
    }

    const totalCol: ColumnDef<BillingRecord, unknown> = {
      id: "total",
      accessorKey: "total",
      header: "Total",
      meta: meta({ field: "total", kind: "currency" }),
    }

    const m: Record<string, ColumnDef<BillingRecord, unknown>> = {
      __expand__: expandCol,
      client: clientCol,
      billing_type: typeCol,
      campaign_name: campaignCol,
      billing_month: monthCol,
      status: statusCol,
      po_number: poCol,
      invoice_date: invCol,
      total: totalCol,
    }
    return m
  }, [expanded, toggleExpand])

  const orderedColumns = useMemo(() => {
    const out: ColumnDef<BillingRecord, unknown>[] = []
    for (const id of columnOrder) {
      const c = columnMap[id]
      if (c) out.push(c)
    }
    for (const id of DEFAULT_COLUMN_ORDER) {
      if (!columnOrder.includes(id) && columnMap[id]) out.push(columnMap[id])
    }
    return out
  }, [columnMap, columnOrder])

  const handleExportExcel = useCallback(async () => {
    if (sortedRows.length === 0) {
      toast({ title: "Nothing to export", description: "There are no receivable rows in view." })
      return
    }
    try {
      const wb = await buildReceivablesExcelWorkbook(sortedRows)
      const buf = await workbookToXlsxBuffer(wb)
      const blob = new Blob([buf], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      })
      saveAs(blob, `Receivables_${new Date().toISOString().slice(0, 10)}.xlsx`)
      toast({ title: "Exported", description: "Excel workbook downloaded." })
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Export failed",
        description: e instanceof Error ? e.message : "Unknown error",
      })
    }
  }, [sortedRows, toast])

  const handleExportCsv = useCallback(() => {
    exportBillingRecordsCsv(sortedRows, `Receivables_${new Date().toISOString().slice(0, 10)}.csv`)
    toast({ title: "Exported", description: "CSV downloaded." })
  }, [sortedRows, toast])

  const handleSaveView = useCallback(async () => {
    const name = window.prompt("Name this saved view")
    if (!name?.trim()) return
    try {
      const created = await saveSavedView({ name: name.trim(), filters })
      persistReceivablesUiForView(created.id, columnOrder, sort)
      const list = await fetchSavedViews()
      setSavedViews(Array.isArray(list) ? list : [])
      toast({ title: "Saved", description: `View “${created.name}” stored.` })
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Save failed",
        description: e instanceof Error ? e.message : "Unknown error",
      })
    }
  }, [columnOrder, filters, sort, toast])

  const handleApplyView = useCallback(
    (view: SavedView) => {
      setFilters(view.filters)
      const ui = loadReceivablesUiForView(view.id)
      if (ui) {
        setColumnOrder(ui.columnOrder)
        setSort(ui.sort)
      } else {
        setColumnOrder([...DEFAULT_COLUMN_ORDER])
        setSort({ columnId: "client", desc: false })
      }
      toast({ title: "View applied", description: view.name })
    },
    [setFilters, toast]
  )

  const sortColumnIds = ["client", "billing_type", "campaign_name", "billing_month", "status", "po_number", "invoice_date", "total"] as const

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading receivables…
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-6 text-sm text-destructive">
        {loadError}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 border-b border-border/60 pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Bookmark className="mr-2 h-4 w-4" />
                Saved views
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuItem onClick={() => void handleSaveView()}>
                <Save className="mr-2 h-4 w-4" />
                Save current view…
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {savedViews.length === 0 ? (
                <DropdownMenuItem disabled>No saved views</DropdownMenuItem>
              ) : (
                savedViews.map((v) => (
                  <DropdownMenuItem key={v.id} onClick={() => handleApplyView(v)}>
                    {v.name}
                  </DropdownMenuItem>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="flex flex-wrap items-center gap-2">
            <Label htmlFor="recv-sort-col" className="text-xs text-muted-foreground">
              Sort
            </Label>
            <Select
              value={sort?.columnId ?? "client"}
              onValueChange={(columnId) =>
                setSort((s) => ({ columnId, desc: s?.desc ?? false }))
              }
            >
              <SelectTrigger id="recv-sort-col" className="h-8 w-[140px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sortColumnIds.map((id) => (
                  <SelectItem key={id} value={id}>
                    {id.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <Switch
                id="recv-sort-desc"
                checked={sort?.desc ?? false}
                onCheckedChange={(checked) =>
                  setSort((s) => ({
                    columnId: s?.columnId ?? "client",
                    desc: checked,
                  }))
                }
              />
              <Label htmlFor="recv-sort-desc" className="text-xs text-muted-foreground">
                Desc
              </Label>
            </div>
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => void handleExportExcel()}>Export to Excel</DropdownMenuItem>
            <DropdownMenuItem onClick={handleExportCsv}>Export to CSV</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {sortedRows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No receivable billing rows for the current filters.</p>
      ) : (
        <EditableFinanceGrid
          columns={orderedColumns}
          records={sortedRows}
          onCellEdit={onCellEdit}
          groupBy="month_client"
          editableFields={[...EDITABLE_FIELDS]}
          expandedRecordIds={expanded}
          statusComboboxOptions={RECEIVABLE_STATUS_OPTIONS}
          renderDetailRow={(r) => (
            <ReceivablesLineItemsPanel
              record={r}
              totalOverrides={totalOverrides}
              onRecordReplace={replaceRecord}
            />
          )}
        />
      )}
    </div>
  )
}
