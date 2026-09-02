"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Download } from "lucide-react"
import { FinanceSectionsShell } from "@/components/finance/sections/FinanceSectionsShell"
import { SectionScopeBar } from "@/components/finance/sections/SectionScopeBar"
import { StatTile } from "@/components/finance/sections/StatTile"
import { BillingStateBadge } from "@/components/finance/BillingStateBadge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states"
import {
  compareValues,
  SortableTableHeader,
  type SortDirection,
} from "@/components/ui/sortable-table-header"
import { fetchFinanceSectionsJson } from "@/lib/finance/sections/api"
import { exportOwedExcel } from "@/lib/finance/sections/exportOwed"
import { arInvoicePdfPath } from "@/lib/finance/invoices/invoicePdfPaths"
import {
  OWED_BUCKET_IDS,
  type OwedBucket,
  type OwedLedgerPayload,
  type OwedLedgerRow,
} from "@/lib/finance/sections/owedLedger"
import {
  useFinanceScopeApplied,
  useFinanceScopeVersion,
} from "@/lib/finance/sections/useFinanceScope"
import { formatDateShort } from "@/lib/format/date"
import { formatMoney } from "@/lib/format/money"
import type { ViewState } from "@/lib/ui/viewState"
import { cn } from "@/lib/utils"

const BUCKET_LABEL: Record<OwedBucket, string> = {
  not_yet_due: "Not yet due",
  d1_14: "1–14 days",
  d15_30: "15–30 days",
  d31_60: "31–60 days",
  d60_plus: "60+ days",
}

const BUCKET_ACCENT: Record<OwedBucket, string> = {
  not_yet_due: "bg-primary",
  d1_14: "bg-pacing-behind",
  d15_30: "bg-pacing-behind",
  d31_60: "bg-pacing-critical",
  d60_plus: "bg-pacing-critical",
}

const BASIS = "Xero AR outstanding, ex-GST"

type SortColumn = "dueDate" | "outstanding"

function moneyCell(cents: number): string {
  return formatMoney(cents / 100)
}

function sortRows(
  rows: OwedLedgerRow[],
  column: SortColumn,
  direction: Exclude<SortDirection, null>
): OwedLedgerRow[] {
  const valueOf = (row: OwedLedgerRow) =>
    column === "dueDate" ? row.dueDate ?? "" : row.outstandingCents
  return rows.toSorted((a, b) => compareValues(valueOf(a), valueOf(b), direction))
}

export function OwedPageClient() {
  const applied = useFinanceScopeApplied()
  const scopeVersion = useFinanceScopeVersion()
  const [bucket, setBucket] = useState<OwedBucket | null>(null)
  const [searchInput, setSearchInput] = useState("")
  const [search, setSearch] = useState("")
  const [exporting, setExporting] = useState(false)
  const [sortColumn, setSortColumn] = useState<SortColumn>("dueDate")
  const [sortDirection, setSortDirection] = useState<Exclude<SortDirection, null>>("asc")
  const [view, setView] = useState<ViewState<OwedLedgerPayload>>({ status: "loading" })
  const [updating, setUpdating] = useState(false)

  useEffect(() => {
    const t = window.setTimeout(() => setSearch(searchInput.trim()), 300)
    return () => window.clearTimeout(t)
  }, [searchInput])

  const load = useCallback(() => {
    setView((prev) => {
      if (prev.status === "ready") return prev
      return { status: "loading" }
    })
    setUpdating(true)
    const params: Record<string, string | number | undefined | null> = {}
    if (applied.clients.length > 0) params.clients = applied.clients.join(",")
    if (bucket) params.bucket = bucket
    if (search) params.search = search
    void fetchFinanceSectionsJson<OwedLedgerPayload>(
      "/api/finance/sections/owed",
      params,
      { retry: () => load() }
    ).then((next) => {
      setUpdating(false)
      setView(next)
    })
  }, [applied.clients, bucket, search])

  useEffect(() => {
    load()
  }, [load, scopeVersion])

  const toggleSort = (column: SortColumn) => {
    if (sortColumn !== column) {
      setSortColumn(column)
      setSortDirection(column === "outstanding" ? "desc" : "asc")
      return
    }
    setSortDirection((d) => (d === "asc" ? "desc" : "asc"))
  }

  const payload = view.status === "ready" ? view.data : null

  const sortedRows = useMemo(() => {
    if (!payload) return { resolved: [] as OwedLedgerRow[], unresolved: [] as OwedLedgerRow[] }
    const resolved = sortRows(
      payload.rows.filter((r) => r.group === "client"),
      sortColumn,
      sortDirection
    )
    const unresolved = sortRows(
      payload.rows.filter((r) => r.group === "unresolved"),
      sortColumn,
      sortDirection
    )
    return { resolved, unresolved }
  }, [payload, sortColumn, sortDirection])

  const onExport = async () => {
    if (!payload) return
    setExporting(true)
    try {
      await exportOwedExcel(payload, `owed-ledger-${payload.asOf}.xlsx`)
    } finally {
      setExporting(false)
    }
  }

  const tileState = (id: OwedBucket) => {
    if (view.status === "loading" && !payload) return { status: "loading" as const }
    if (view.status === "error") return { status: "error" as const, message: view.message }
    if (!payload) return { status: "empty" as const }
    return { status: "ready" as const, cents: payload.buckets[id].amountCents }
  }

  const showingLabel = payload
    ? `${payload.totals.count} open invoices · as of ${payload.asOf} · not FY-clipped`
    : "All open AUTHORISED invoices · not FY-clipped"

  const dimmed = updating && view.status === "ready"

  return (
    <FinanceSectionsShell
      title="Owed"
      scopeBar={<SectionScopeBar showingLabel={showingLabel} />}
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Live Xero AR ageing. Amounts are ex-GST. Client filter applies; FY and month range do
          not — overdue invoices stay visible. This tab reports; it does not chase.
        </p>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {OWED_BUCKET_IDS.map((id) => {
            const selected = bucket === id
            const count = payload?.buckets[id].count ?? 0
            return (
              <button
                key={id}
                type="button"
                aria-pressed={selected}
                className={cn(
                  "interactive rounded-card text-left",
                  selected && "ring-2 ring-ring"
                )}
                onClick={() => setBucket((prev) => (prev === id ? null : id))}
              >
                <StatTile
                  label={BUCKET_LABEL[id]}
                  basisCaption={`${count} invoice${count === 1 ? "" : "s"} · ${BASIS}`}
                  state={tileState(id)}
                  accent={BUCKET_ACCENT[id]}
                />
              </button>
            )
          })}
        </div>

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-[12rem] flex-1">
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Search
            </label>
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Invoice #, reference, client"
              aria-label="Search invoices"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!payload || exporting}
            onClick={() => void onExport()}
          >
            <Download className="mr-1.5 size-3.5" aria-hidden />
            {exporting ? "Exporting…" : "Export Excel"}
          </Button>
        </div>

        {payload ? (
          <p className="text-xs text-muted-foreground">
            <span className="num">{payload.coverage.resolvedCount}</span>
            {" of "}
            <span className="num">{payload.coverage.totalCount}</span>
            {" invoices resolved to a client ("}
            <span className="num">{payload.coverage.resolvedPct}</span>
            {"%). Unresolved: "}
            <span className="num">{moneyCell(payload.coverage.unresolvedAmountCents)}</span>
            {" · table shows "}
            <span className="num">{payload.rows.length}</span>
            {bucket ? ` in ${BUCKET_LABEL[bucket]}` : " (all buckets)"}
            {"."}
          </p>
        ) : null}

        {view.status === "loading" && !payload ? (
          <LoadingState rows={8} />
        ) : view.status === "error" ? (
          <ErrorState message={view.message} onRetry={() => load()} />
        ) : !payload || (payload.rows.length === 0 && payload.totals.count === 0) ? (
          <EmptyState
            title="Nothing outstanding"
            message="No AUTHORISED Xero invoices currently have an amount due."
          />
        ) : payload.rows.length === 0 ? (
          <EmptyState
            title="No invoices in this filter"
            message="Try another ageing bucket, or clear search."
            action={
              <Button type="button" variant="outline" size="sm" onClick={() => setBucket(null)}>
                Clear bucket
              </Button>
            }
          />
        ) : (
          <div className={cn("overflow-x-auto rounded-card border border-border", dimmed && "opacity-70")}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Issued</TableHead>
                  <SortableTableHeader
                    label="Due"
                    direction={sortColumn === "dueDate" ? sortDirection : null}
                    onToggle={() => toggleSort("dueDate")}
                  />
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <SortableTableHeader
                    label="Outstanding"
                    align="right"
                    direction={sortColumn === "outstanding" ? sortDirection : null}
                    onToggle={() => toggleSort("outstanding")}
                  />
                  <TableHead className="text-right">Age</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>PDF</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedRows.resolved.map((row) => (
                  <OwedInvoiceRow key={row.invoiceKey} row={row} />
                ))}
                {sortedRows.unresolved.length > 0 ? (
                  <>
                    <TableRow className="bg-surface-panel hover:bg-surface-panel">
                      <TableCell colSpan={10} className="text-xs font-medium text-muted-foreground">
                        Unresolved client
                        <span className="num ml-2">{sortedRows.unresolved.length}</span>
                      </TableCell>
                    </TableRow>
                    {sortedRows.unresolved.map((row) => (
                      <OwedInvoiceRow key={row.invoiceKey} row={row} />
                    ))}
                  </>
                ) : null}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </FinanceSectionsShell>
  )
}

function OwedInvoiceRow({ row }: { row: OwedLedgerRow }) {
  return (
    <TableRow className="interactive-row">
      <TableCell className="text-xs">
        <p className="truncate font-medium">{row.clientName}</p>
        {row.contactName &&
        row.contactName.toLowerCase() !== row.clientName.toLowerCase() ? (
          <p className="truncate text-[11px] text-muted-foreground" title={row.contactName}>
            {row.contactName}
          </p>
        ) : null}
      </TableCell>
      <TableCell className="num text-xs">{row.invoiceNumber}</TableCell>
      <TableCell className="num text-xs">{formatDateShort(row.issueDate)}</TableCell>
      <TableCell className="num text-xs">{formatDateShort(row.dueDate)}</TableCell>
      <TableCell className="num text-right text-xs">{moneyCell(row.totalCents)}</TableCell>
      <TableCell className="num text-right text-xs">{moneyCell(row.paidCents)}</TableCell>
      <TableCell className="num text-right text-xs font-medium">
        {moneyCell(row.outstandingCents)}
      </TableCell>
      <TableCell className="num text-right text-xs">
        {row.daysOverdue > 0 ? `${row.daysOverdue}d` : "—"}
      </TableCell>
      <TableCell>
        <BillingStateBadge state={row.state} />
      </TableCell>
      <TableCell>
        {row.pdfAvailable ? (
          <a
            href={arInvoicePdfPath(row.invoiceKey)}
            className="text-[11px] text-foreground underline-offset-2 hover:underline"
          >
            PDF
          </a>
        ) : (
          <span className="text-[11px] text-muted-foreground">—</span>
        )}
      </TableCell>
    </TableRow>
  )
}
