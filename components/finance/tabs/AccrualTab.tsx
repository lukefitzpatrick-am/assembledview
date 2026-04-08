"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { Download, Loader2 } from "lucide-react"
import { EditableFinanceGrid } from "@/components/finance/EditableFinanceGrid"
import type { FinanceColumnMeta } from "@/components/finance/EditableFinanceGrid"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useToast } from "@/components/ui/use-toast"
import type { BillingRecord, BillingType } from "@/lib/types/financeBilling"
import {
  accrualBucketKey,
  computeAccrualByClient,
  parseAccrualReconcilesFromEdits,
  type AccrualRow,
} from "@/lib/finance/computeAccrual"
import { exportAccrualWorkbook } from "@/lib/finance/accrualExcel"
import { fetchFinanceEditsList, postAccrualReconcileEdit } from "@/lib/finance/api"
import { formatMoney } from "@/lib/utils/money"
import { cn } from "@/lib/utils"
import { useAccrualMonths, useFinanceStore } from "@/lib/finance/useFinanceStore"

const RECEIVABLE_TYPES: BillingType[] = ["media", "sow", "retainer"]

function isReceivableBillingType(bt: BillingType): boolean {
  return RECEIVABLE_TYPES.includes(bt)
}

const ACCRUAL_ROW_ID_BASE = 812_000_000

function hashClientSubtotalId(clients_id: number, clientName: string): number {
  let h = 0
  const s = `${clients_id}|${clientName}`
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return -(Math.abs(h) % 800_000_000 + 1)
}

const GRAND_TOTAL_ID = -999_999_999

function accrualGroupCompare(a: BillingRecord, b: BillingRecord) {
  const subA = a.finance_accrual?.kind === "client_subtotal"
  const subB = b.finance_accrual?.kind === "client_subtotal"
  if (subA && !subB) return 1
  if (!subA && subB) return -1
  return (a.billing_month || "").localeCompare(b.billing_month || "")
}

function accrualRowToBillingRecord(ar: AccrualRow, id: number): BillingRecord {
  return {
    id,
    billing_type: "media",
    clients_id: ar.clients_id,
    client_name: ar.client_name,
    mba_number: null,
    campaign_name: null,
    po_number: null,
    billing_month: ar.month,
    invoice_date: null,
    payment_days: 0,
    payment_terms: "",
    status: "booked",
    line_items: [],
    total: ar.accrual,
    has_pending_edits: false,
    source_billing_schedule_id: null,
    finance_accrual: {
      kind: "month",
      receivable_total: ar.receivable_total,
      payable_total: ar.payable_total,
      fees_total: ar.fees_total,
      accrual: ar.accrual,
      month: ar.month,
      clients_id: ar.clients_id,
    },
  }
}

function buildAccrualGridRecords(
  rows: AccrualRow[]
): { records: BillingRecord[]; idToAccrual: Map<number, AccrualRow> } {
  const idToAccrual = new Map<number, AccrualRow>()
  const byClient = new Map<string, AccrualRow[]>()
  for (const r of rows) {
    const k = r.client_name.trim() || "—"
    if (!byClient.has(k)) byClient.set(k, [])
    byClient.get(k)!.push(r)
  }
  const clients = [...byClient.keys()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
  const records: BillingRecord[] = []
  let n = 0
  for (const c of clients) {
    const list = byClient.get(c)!
    for (const ar of list) {
      const id = ACCRUAL_ROW_ID_BASE + n++
      idToAccrual.set(id, ar)
      records.push(accrualRowToBillingRecord(ar, id))
    }
    const sub = list.reduce(
      (acc, r) => ({
        recv: acc.recv + r.receivable_total,
        pay: acc.pay + r.payable_total,
        fees: acc.fees + r.fees_total,
        accrual: acc.accrual + r.accrual,
      }),
      { recv: 0, pay: 0, fees: 0, accrual: 0 }
    )
    const cid = list[0]!.clients_id
    records.push({
      id: hashClientSubtotalId(cid, c),
      billing_type: "media",
      clients_id: cid,
      client_name: c,
      mba_number: null,
      campaign_name: null,
      po_number: "",
      billing_month: "",
      invoice_date: null,
      payment_days: 0,
      payment_terms: "",
      status: "booked",
      line_items: [],
      total: sub.accrual,
      has_pending_edits: false,
      source_billing_schedule_id: null,
      finance_accrual: {
        kind: "client_subtotal",
        receivable_total: sub.recv,
        payable_total: sub.pay,
        fees_total: sub.fees,
        accrual: sub.accrual,
      },
    })
  }

  const grand = rows.reduce(
    (acc, r) => ({
      recv: acc.recv + r.receivable_total,
      pay: acc.pay + r.payable_total,
      fees: acc.fees + r.fees_total,
      accrual: acc.accrual + r.accrual,
    }),
    { recv: 0, pay: 0, fees: 0, accrual: 0 }
  )
  records.push({
    id: GRAND_TOTAL_ID,
    billing_type: "media",
    clients_id: 0,
    client_name: "Grand total",
    mba_number: null,
    campaign_name: null,
    po_number: "",
    billing_month: "",
    invoice_date: null,
    payment_days: 0,
    payment_terms: "",
    status: "booked",
    line_items: [],
    total: grand.accrual,
    has_pending_edits: false,
    source_billing_schedule_id: null,
    finance_accrual: {
      kind: "grand_total",
      receivable_total: grand.recv,
      payable_total: grand.pay,
      fees_total: grand.fees,
      accrual: grand.accrual,
    },
  })

  return { records, idToAccrual }
}

function monthLabelForFile(from: string, to: string) {
  return from === to ? from : `${from}_${to}`
}

export function AccrualTab() {
  const filters = useFinanceStore((s) => s.filters)
  const billingRecords = useFinanceStore((s) => s.billingRecords)
  const payablesRecords = useFinanceStore((s) => s.payablesRecords)
  const billingLoading = useFinanceStore((s) => s.billingLoading)
  const payablesLoading = useFinanceStore((s) => s.payablesLoading)
  const accrualMonths = useAccrualMonths()
  const { toast } = useToast()

  const [editsList, setEditsList] = useState<unknown[]>([])
  const [panelRow, setPanelRow] = useState<AccrualRow | null>(null)
  const [reconcileBusy, setReconcileBusy] = useState<string | null>(null)

  const loadEdits = useCallback(async () => {
    try {
      setEditsList(await fetchFinanceEditsList())
    } catch {
      setEditsList([])
    }
  }, [])

  useEffect(() => {
    void loadEdits()
  }, [loadEdits])

  const reconcileMap = useMemo(() => parseAccrualReconcilesFromEdits(editsList), [editsList])

  const receivables = useMemo(
    () => billingRecords.filter((r) => isReceivableBillingType(r.billing_type)),
    [billingRecords]
  )

  const accrualRowsRaw = useMemo(
    () => computeAccrualByClient(receivables, payablesRecords, filters.monthRange, reconcileMap),
    [receivables, payablesRecords, filters.monthRange, reconcileMap, accrualMonths]
  )

  const accrualRows = useMemo(() => {
    let list = accrualRowsRaw
    if (filters.selectedClients.length > 0) {
      const want = new Set(filters.selectedClients.map(String))
      list = list.filter((r) => want.has(String(r.clients_id)))
    }
    const q = filters.searchQuery.trim().toLowerCase()
    if (q) {
      list = list.filter((r) => r.client_name.toLowerCase().includes(q) || r.month.includes(q))
    }
    return list
  }, [accrualRowsRaw, filters.selectedClients, filters.searchQuery])

  const { records: gridRecords, idToAccrual } = useMemo(
    () => buildAccrualGridRecords(accrualRows),
    [accrualRows]
  )

  const noopCellEdit = useCallback(async () => {}, [])

  const handleReconcileToggle = useCallback(
    async (ar: AccrualRow, next: boolean) => {
      const key = accrualBucketKey(ar.clients_id, ar.month)
      setReconcileBusy(key)
      try {
        await postAccrualReconcileEdit({
          clients_id: ar.clients_id,
          month: ar.month,
          reconciled: next,
        })
        await loadEdits()
        toast({ title: next ? "Marked reconciled" : "Reconciliation cleared" })
      } catch (e) {
        toast({
          variant: "destructive",
          title: "Could not save reconciliation",
          description: e instanceof Error ? e.message : "Request failed",
        })
      } finally {
        setReconcileBusy(null)
      }
    },
    [loadEdits, toast]
  )

  const handleExport = useCallback(async () => {
    const stem = `Accrual_${monthLabelForFile(filters.monthRange.from, filters.monthRange.to)}`
    await exportAccrualWorkbook(accrualRows, `${stem}.xlsx`)
  }, [accrualRows, filters.monthRange.from, filters.monthRange.to])

  const columns = useMemo(() => {
    const meta = (m: FinanceColumnMeta): { finance: FinanceColumnMeta } => ({ finance: m })

    const clientCol: ColumnDef<BillingRecord, unknown> = {
      id: "client_name",
      header: "Client",
      size: 200,
      meta: meta({ field: "client_name", kind: "text" }),
      cell: ({ row }) => {
        const k = row.original.finance_accrual?.kind
        if (k === "client_subtotal") return <span className="font-semibold">Subtotal</span>
        if (k === "grand_total") return <span className="font-semibold">—</span>
        return row.original.client_name
      },
    }

    const monthCol: ColumnDef<BillingRecord, unknown> = {
      id: "billing_month",
      header: "Month",
      size: 100,
      meta: meta({ field: "billing_month", kind: "text" }),
      cell: ({ getValue, row }) => {
        const k = row.original.finance_accrual?.kind
        if (k === "client_subtotal" || k === "grand_total") return "—"
        return (getValue() as string) || "—"
      },
    }

    const recvCol: ColumnDef<BillingRecord, unknown> = {
      id: "recv",
      header: "Receivable",
      size: 120,
      meta: meta({ kind: "currency" }),
      cell: ({ row }) => {
        const fa = row.original.finance_accrual
        if (!fa) return "—"
        return <span className="tabular-nums">{formatMoney(fa.receivable_total)}</span>
      },
    }

    const payCol: ColumnDef<BillingRecord, unknown> = {
      id: "pay",
      header: "Payable",
      size: 120,
      meta: meta({ kind: "currency" }),
      cell: ({ row }) => {
        const fa = row.original.finance_accrual
        if (!fa) return "—"
        return <span className="tabular-nums">{formatMoney(fa.payable_total)}</span>
      },
    }

    const feesCol: ColumnDef<BillingRecord, unknown> = {
      id: "fees",
      header: "Fees",
      size: 120,
      meta: meta({ kind: "currency" }),
      cell: ({ row }) => {
        const fa = row.original.finance_accrual
        if (!fa) return "—"
        return <span className="tabular-nums">{formatMoney(fa.fees_total)}</span>
      },
    }

    const accCol: ColumnDef<BillingRecord, unknown> = {
      id: "accrual",
      header: "Accrual",
      size: 120,
      meta: meta({ kind: "currency" }),
      cell: ({ row }) => {
        const fa = row.original.finance_accrual
        if (!fa) return "—"
        const v = fa.accrual
        return (
          <span
            className={cn(
              "tabular-nums font-medium",
              v < 0 && "text-destructive",
              v > 0 && "text-emerald-600 dark:text-emerald-400",
              v === 0 && "text-muted-foreground"
            )}
          >
            {v > 0 ? `+${formatMoney(v)}` : formatMoney(v)}
          </span>
        )
      },
    }

    const reconCol: ColumnDef<BillingRecord, unknown> = {
      id: "reconciled",
      header: "Reconciled",
      size: 100,
      meta: meta({ kind: "text" }),
      cell: ({ row }) => {
        const r = row.original
        const k = r.finance_accrual?.kind
        if (k !== "month") return "—"
        const ar = idToAccrual.get(r.id)
        if (!ar) return null
        const busyKey = accrualBucketKey(ar.clients_id, ar.month)
        return (
          <div className="flex items-center gap-2 px-1" data-no-row-click>
            <Checkbox
              checked={ar.reconciled}
              disabled={reconcileBusy === busyKey}
              onCheckedChange={(v) => void handleReconcileToggle(ar, v === true)}
              aria-label={`Reconciled ${ar.client_name} ${ar.month}`}
            />
          </div>
        )
      },
    }

    return [clientCol, monthCol, recvCol, payCol, feesCol, accCol, reconCol]
  }, [handleReconcileToggle, idToAccrual, reconcileBusy])

  const getRecordRowClassName = useCallback((record: BillingRecord) => {
    const k = record.finance_accrual?.kind
    if (k === "client_subtotal" || k === "grand_total") return "font-semibold bg-muted/25"
    return undefined
  }, [])

  const onDataRowClick = useCallback(
    (record: BillingRecord) => {
      if (record.finance_accrual?.kind !== "month") return
      const ar = idToAccrual.get(record.id)
      if (ar) setPanelRow(ar)
    },
    [idToAccrual]
  )

  const loading = billingLoading || payablesLoading

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={accrualRows.length === 0}>
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => void handleExport()}>Excel (2 sheets)</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading billing & payables…
        </div>
      ) : null}

      {!loading && accrualRows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No accrual rows for the current filters and month range.</p>
      ) : null}

      {gridRecords.length > 0 ? (
        <EditableFinanceGrid
          columns={columns}
          records={gridRecords}
          onCellEdit={noopCellEdit}
          groupBy="client"
          editableFields={[]}
          enableStoreOptimisticSync={false}
          hideFooter
          compareRecordsInGroup={accrualGroupCompare}
          onDataRowClick={onDataRowClick}
          getRecordRowClassName={getRecordRowClassName}
        />
      ) : null}

      <Sheet open={panelRow !== null} onOpenChange={(o) => !o && setPanelRow(null)}>
        <SheetContent className="flex w-full max-w-lg flex-col sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>
              {panelRow ? (
                <>
                  {panelRow.client_name} · {panelRow.month}
                </>
              ) : null}
            </SheetTitle>
          </SheetHeader>
          {panelRow ? (
            <ScrollArea className="mt-4 flex-1 pr-3">
              <div className="space-y-6 text-sm">
                <div>
                  <Label className="text-xs uppercase text-muted-foreground">Receivables (contributors)</Label>
                  <ul className="mt-2 space-y-2 border-t border-border/60 pt-2">
                    {panelRow.contributing_receivables.length === 0 ? (
                      <li className="text-muted-foreground">None</li>
                    ) : (
                      panelRow.contributing_receivables.map((r) => (
                        <li key={r.id} className="rounded-md border border-border/50 bg-muted/20 p-2">
                          <div className="font-medium">
                            {r.billing_type} · {r.mba_number || "—"}
                          </div>
                          <div className="text-muted-foreground">{r.campaign_name || "—"}</div>
                          <div className="mt-1 tabular-nums">{formatMoney(Number(r.total || 0))}</div>
                          <div className="text-xs text-muted-foreground">Status: {r.status}</div>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
                <div>
                  <Label className="text-xs uppercase text-muted-foreground">Payables (expected)</Label>
                  <ul className="mt-2 space-y-2 border-t border-border/60 pt-2">
                    {panelRow.contributing_payables.length === 0 ? (
                      <li className="text-muted-foreground">None</li>
                    ) : (
                      panelRow.contributing_payables.map((r) => {
                        const expected = (r.line_items || []).reduce(
                          (s, li) => s + Number(li.amount || 0),
                          0
                        )
                        return (
                          <li key={r.id} className="rounded-md border border-border/50 bg-muted/20 p-2">
                            <div className="font-medium">{r.mba_number || "—"}</div>
                            <div className="text-muted-foreground">{r.campaign_name || "—"}</div>
                            <div className="mt-1 tabular-nums">{formatMoney(expected)}</div>
                            <div className="text-xs text-muted-foreground">Status: {r.status}</div>
                          </li>
                        )
                      })
                    )}
                  </ul>
                </div>
              </div>
            </ScrollArea>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  )
}
