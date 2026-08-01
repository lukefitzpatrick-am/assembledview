"use client"

/**
 * Costs Accruals — adapted COPY of hub `FinanceAccrualPanel`.
 * Same `computeAccrualByClient` engine; wired to `useFinanceScope`.
 * Hub panel left untouched.
 */

import { useCallback, useMemo, useState } from "react"
import Link from "next/link"
import type { ColumnDef } from "@tanstack/react-table"
import { Download, ExternalLink } from "lucide-react"
import { CostsSubNav } from "@/components/finance/sections/costs/CostsSubNav"
import { EmptyState } from "@/components/finance/sections/EmptyState"
import { ErrorState } from "@/components/finance/sections/ErrorState"
import { LoadingState } from "@/components/finance/sections/LoadingState"
import { SectionScopeBar } from "@/components/finance/sections/SectionScopeBar"
import { StatTile, type StatTileMoneyState } from "@/components/finance/sections/StatTile"
import { FinanceSectionsShell } from "@/components/finance/sections/FinanceSectionsShell"
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
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useToast } from "@/components/ui/use-toast"
import type { BillingRecord } from "@/lib/types/financeBilling"
import {
  accrualBucketKey,
  type AccrualRow,
} from "@/lib/finance/computeAccrual"
import { exportAccrualWorkbook } from "@/lib/finance/accrualExcel"
import { postAccrualReconcileEdit } from "@/lib/finance/api"
import { fyDisplayLabel } from "@/lib/finance/months"
import {
  investmentHrefForAccrual,
  mbaBreakdownFromAccrualRow,
  useCostsAccrualData,
} from "@/lib/finance/sections/useCostsAccrualData"
import { useFinanceScopeApplied } from "@/lib/finance/sections/useFinanceScope"
import { formatAUD } from "@/lib/format/money"
import { cn } from "@/lib/utils"

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
  const clients = [...byClient.keys()].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" })
  )
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

function centsFromDollars(n: number): number {
  return Math.round(n * 100)
}

export function CostsAccrualsClient() {
  const applied = useFinanceScopeApplied()
  const { loading, isUpdating, error, rows, sourceCaption, reload, reloadEdits } =
    useCostsAccrualData()
  const { toast } = useToast()
  const [panelRow, setPanelRow] = useState<AccrualRow | null>(null)
  const [reconcileBusy, setReconcileBusy] = useState<string | null>(null)

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => ({
        recv: acc.recv + r.receivable_total,
        pay: acc.pay + r.payable_total,
        fees: acc.fees + r.fees_total,
        accrual: acc.accrual + r.accrual,
      }),
      { recv: 0, pay: 0, fees: 0, accrual: 0 }
    )
  }, [rows])

  const tileState = (cents: number): StatTileMoneyState => {
    if (loading && rows.length === 0) return { status: "loading" }
    if (error && rows.length === 0) return { status: "error", message: error }
    if (!loading && !error && rows.length === 0) return { status: "empty" }
    return { status: "ready", cents }
  }

  const { records: gridRecords, idToAccrual } = useMemo(
    () => buildAccrualGridRecords(rows),
    [rows]
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
        await reloadEdits()
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
    [reloadEdits, toast]
  )

  const handleExport = useCallback(async () => {
    const stem = `Accrual_${monthLabelForFile(applied.monthRange.from, applied.monthRange.to)}`
    await exportAccrualWorkbook(rows, `${stem}.xlsx`)
  }, [rows, applied.monthRange.from, applied.monthRange.to])

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
        return <span className="num">{formatAUD(fa.receivable_total)}</span>
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
        return <span className="num">{formatAUD(fa.payable_total)}</span>
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
        return <span className="num">{formatAUD(fa.fees_total)}</span>
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
              "num font-medium",
              v < 0 && "text-destructive",
              v > 0 && "text-status-ahead-fg",
              v === 0 && "text-muted-foreground"
            )}
          >
            {v > 0 ? `+${formatAUD(v)}` : formatAUD(v)}
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

    const investCol: ColumnDef<BillingRecord, unknown> = {
      id: "investment",
      header: "Investment",
      size: 110,
      meta: meta({ kind: "text" }),
      cell: ({ row }) => {
        const k = row.original.finance_accrual?.kind
        if (k !== "month") return "—"
        const ar = idToAccrual.get(row.original.id)
        if (!ar) return null
        const href = investmentHrefForAccrual(ar.client_name, ar.clients_id, ar.month)
        return (
          <Link
            href={href}
            data-no-row-click
            className="inline-flex items-center gap-0.5 text-xs text-foreground underline-offset-2 hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            Open <ExternalLink className="size-3" aria-hidden />
          </Link>
        )
      },
    }

    return [clientCol, monthCol, recvCol, payCol, feesCol, accCol, reconCol, investCol]
  }, [handleReconcileToggle, idToAccrual, reconcileBusy])

  const getRecordRowClassName = useCallback((record: BillingRecord) => {
    const k = record.finance_accrual?.kind
    if (k === "client_subtotal" || k === "grand_total") return "bg-surface-panel font-semibold"
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

  const showingLabel = `Showing accruals for FY${fyDisplayLabel(applied.fy)} · ${applied.monthRange.from} → ${applied.monthRange.to}`
  const mbaRows = panelRow ? mbaBreakdownFromAccrualRow(panelRow) : []

  return (
    <FinanceSectionsShell
      title="Accruals"
      scopeBar={<SectionScopeBar showingLabel={showingLabel} />}
    >
      <div className="space-y-4">
        <CostsSubNav />

        <p className="rounded-card border border-border bg-surface-panel px-3 py-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Basis: </span>
          Receivable (billing schedule booked/approved/invoiced/paid) − payable (delivery, agency
          expected) − SOW/retainer service fees. {sourceCaption}
        </p>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            label="Receivable (billing)"
            basisCaption="Booked + approved + invoiced + paid · media/sow/retainer totals"
            state={tileState(centsFromDollars(totals.recv))}
          />
          <StatTile
            label="Payable (delivery)"
            basisCaption="Delivery-basis payables · agency owed line sum"
            state={tileState(centsFromDollars(totals.pay))}
          />
          <StatTile
            label="Fees (SOW/retainer)"
            basisCaption="Service/fee lines on sow + retainer receivables"
            state={tileState(centsFromDollars(totals.fees))}
          />
          <StatTile
            label="Net accrual"
            basisCaption="receivable − payable − fees · same computeAccrualByClient as hub"
            state={tileState(centsFromDollars(totals.accrual))}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            Primary grid is client × month (hub parity). Expand a row for MBA contributors.
            {isUpdating ? " Updating…" : null}
          </p>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={rows.length === 0}>
                <Download className="mr-2 h-4 w-4" />
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => void handleExport()}>
                Excel (2 sheets)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {loading && rows.length === 0 ? <LoadingState rows={4} /> : null}
        {error && rows.length === 0 ? (
          <ErrorState title="Unable to load accruals" message={error} onRetry={reload} />
        ) : null}
        {!loading && !error && rows.length === 0 ? (
          <EmptyState
            title="No accrual rows"
            message="No accrual rows for the current scope month range."
          />
        ) : null}

        {gridRecords.length > 0 ? (
          <div className={cn(isUpdating && "opacity-60")}>
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
          </div>
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
              <SheetDescription className="sr-only">
                Accrual details for this period.
              </SheetDescription>
            </SheetHeader>
            {panelRow ? (
              <ScrollArea className="mt-4 flex-1 pr-3">
                <div className="space-y-6 text-sm">
                  <div>
                    <Link
                      href={investmentHrefForAccrual(
                        panelRow.client_name,
                        panelRow.clients_id,
                        panelRow.month
                      )}
                      className="inline-flex items-center gap-1 text-sm font-medium text-foreground underline-offset-2 hover:underline"
                    >
                      Open in Investment (client + month)
                      <ExternalLink className="size-3.5" aria-hidden />
                    </Link>
                  </div>

                  <div>
                    <Label className="text-xs uppercase text-muted-foreground">
                      By MBA (from contributors)
                    </Label>
                    <ul className="mt-2 space-y-2 border-t border-border/60 pt-2">
                      {mbaRows.length === 0 ? (
                        <li className="text-muted-foreground">None</li>
                      ) : (
                        mbaRows.map((m) => (
                          <li
                            key={m.mbaNumber}
                            className="rounded-input border border-border bg-surface-panel p-2"
                          >
                            <div className="font-medium">{m.mbaNumber}</div>
                            <div className="text-muted-foreground">{m.campaignName}</div>
                            <div className="mt-1 grid grid-cols-2 gap-x-3 text-xs">
                              <span>Recv {formatAUD(m.receivable)}</span>
                              <span>Pay {formatAUD(m.payable)}</span>
                              <span>Fees {formatAUD(m.fees)}</span>
                              <span className="num font-medium">
                                Accrual {formatAUD(m.accrual)}
                              </span>
                            </div>
                          </li>
                        ))
                      )}
                    </ul>
                  </div>

                  <div>
                    <Label className="text-xs uppercase text-muted-foreground">
                      Receivables (contributors)
                    </Label>
                    <ul className="mt-2 space-y-2 border-t border-border/60 pt-2">
                      {panelRow.contributing_receivables.length === 0 ? (
                        <li className="text-muted-foreground">None</li>
                      ) : (
                        panelRow.contributing_receivables.map((r) => (
                          <li
                            key={r.id}
                            className="rounded-input border border-border bg-surface-panel p-2"
                          >
                            <div className="font-medium">
                              {r.billing_type} · {r.mba_number || "—"}
                            </div>
                            <div className="text-muted-foreground">
                              {r.campaign_name || "—"}
                            </div>
                            <div className="num mt-1">{formatAUD(Number(r.total || 0))}</div>
                            <div className="text-xs text-muted-foreground">
                              Status: {r.status}
                            </div>
                          </li>
                        ))
                      )}
                    </ul>
                  </div>
                  <div>
                    <Label className="text-xs uppercase text-muted-foreground">
                      Payables (expected)
                    </Label>
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
                            <li
                              key={r.id}
                              className="rounded-input border border-border bg-surface-panel p-2"
                            >
                              <div className="font-medium">{r.mba_number || "—"}</div>
                              <div className="text-muted-foreground">
                                {r.campaign_name || "—"}
                              </div>
                              <div className="num mt-1">{formatAUD(expected)}</div>
                              <div className="text-xs text-muted-foreground">
                                Status: {r.status}
                              </div>
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
    </FinanceSectionsShell>
  )
}
