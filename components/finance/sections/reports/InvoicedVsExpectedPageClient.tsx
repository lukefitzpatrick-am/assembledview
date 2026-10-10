"use client"

import { useEffect, useState } from "react"
import { Download } from "lucide-react"

import { FinanceSectionsShell } from "@/components/finance/sections/FinanceSectionsShell"
import { StatTile } from "@/components/finance/sections/StatTile"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatMoney } from "@/lib/format/money"
import {
  defaultInvoicedVsExpectedFy,
  invoicedVsExpectedFilename,
  type FyChoice,
  type InvoicedVsExpectedReport,
  type PairRow,
  type TypeChoice,
  type ViewChoice,
} from "@/lib/finance/invoicedVsExpected"

const FY_OPTIONS: { value: FyChoice; label: string }[] = [
  { value: "fy27", label: "FY27" },
  { value: "fy26", label: "FY26" },
  { value: "all", label: "All since FY26" },
]

const TYPE_OPTIONS: { value: TypeChoice; label: string }[] = [
  { value: "all", label: "All types" },
  { value: "media", label: "Media" },
  { value: "sow", label: "Scope" },
  { value: "retainer", label: "Retainer" },
]

const VIEW_OPTIONS: { value: ViewChoice; label: string }[] = [
  { value: "differences", label: "Differences only" },
  { value: "all", label: "All pairs" },
  { value: "unmatched_invoices", label: "Unmatched invoices" },
  { value: "unmatched_months", label: "Unmatched months" },
]

function money(cents: number | null): string {
  if (cents == null) return "—"
  return formatMoney(cents / 100)
}

function ReportTable({ rows }: { rows: PairRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing in this view.</p>
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Month</TableHead>
          <TableHead>Client</TableHead>
          <TableHead>MBA / scope id / retainer</TableHead>
          <TableHead>Type</TableHead>
          <TableHead className="text-right">Expected (AV)</TableHead>
          <TableHead>Source</TableHead>
          <TableHead className="text-right">Invoiced</TableHead>
          <TableHead className="text-right">Delta</TableHead>
          <TableHead>Invoice number</TableHead>
          <TableHead>Xero status</TableHead>
          <TableHead>Resolution</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, index) => (
          <TableRow key={`${row.kind}-${row.month}-${row.invoiceNumber}-${row.reference}-${index}`}>
            <TableCell className="num">{row.month}</TableCell>
            <TableCell>{row.clientName || "—"}</TableCell>
            <TableCell>{row.reference || "—"}</TableCell>
            <TableCell>{row.billingType || "—"}</TableCell>
            <TableCell className="num text-right">{money(row.expectedCents)}</TableCell>
            <TableCell>{row.source || "—"}</TableCell>
            <TableCell className="num text-right">{money(row.invoicedCents)}</TableCell>
            <TableCell className="num text-right">{money(row.deltaCents)}</TableCell>
            <TableCell>{row.invoiceNumber || "—"}</TableCell>
            <TableCell>{row.xeroStatus || "—"}</TableCell>
            <TableCell>{row.resolution || "—"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export function InvoicedVsExpectedPageClient() {
  const [fy, setFy] = useState<FyChoice>(() => defaultInvoicedVsExpectedFy())
  const [clientId, setClientId] = useState<string>("")
  const [type, setType] = useState<TypeChoice>("all")
  const [view, setView] = useState<ViewChoice>("differences")
  const [report, setReport] = useState<InvoicedVsExpectedReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const params = new URLSearchParams({ fy, type, view })
    if (clientId) params.set("client", clientId)
    const ac = new AbortController()
    setLoading(true)
    setError(null)
    void fetch(`/api/finance/reports/invoiced-vs-expected?${params}`, { signal: ac.signal })
      .then(async (res) => {
        const body = (await res.json()) as InvoicedVsExpectedReport & { message?: string }
        if (!res.ok) throw new Error(body.message ?? "Could not load the report.")
        setReport(body)
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return
        setError(err instanceof Error ? err.message : "Could not load the report.")
        setReport(null)
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false)
      })
    return () => ac.abort()
  }, [fy, clientId, type, view])

  const exportParams = new URLSearchParams({ fy, type, view, format: "xlsx" })
  if (clientId) exportParams.set("client", clientId)
  const kpis = report?.kpis
  const basis = FY_OPTIONS.find((option) => option.value === fy)?.label ?? fy
  const showPairSections = view === "differences" || view === "all"

  return (
    <FinanceSectionsShell
      title="Invoiced vs expected"
      headerNote="Ex-GST. Expected is the approved snapshot, else the schedule, else billed amount. Delta is invoiced minus expected."
      scopeBarFramed
      scopeBar={
        <div className="flex flex-wrap items-end gap-3">
          <Filter label="FY" value={fy} onChange={(value) => setFy(value as FyChoice)} options={FY_OPTIONS} />
          <Filter
            label="Client"
            value={clientId}
            onChange={setClientId}
            options={[
              { value: "", label: "All clients" },
              ...(report?.clientOptions ?? []).map((client) => ({
                value: String(client.id),
                label: client.name,
              })),
            ]}
          />
          <Filter
            label="Type"
            value={type}
            onChange={(value) => setType(value as TypeChoice)}
            options={TYPE_OPTIONS}
          />
          <Filter
            label="View"
            value={view}
            onChange={(value) => setView(value as ViewChoice)}
            options={VIEW_OPTIONS}
          />
          <Button variant="outline" size="sm" asChild>
            <a href={`/api/finance/reports/invoiced-vs-expected?${exportParams}`}>
              <Download className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              {invoicedVsExpectedFilename(fy)}
            </a>
          </Button>
        </div>
      }
    >
      {error ? <p className="mb-4 text-sm text-status-critical-fg">{error}</p> : null}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatTile
          label="Invoices in scope"
          basisCaption={basis}
          figure={kpis ? String(kpis.invoicesInScope) : undefined}
          state={tileState(loading, kpis)}
          accent="none"
        />
        <StatTile
          label="Matched"
          basisCaption={basis}
          figure={kpis ? String(kpis.matched) : undefined}
          state={tileState(loading, kpis)}
          accent="none"
        />
        <StatTile
          label="Differ by more than $1"
          basisCaption={basis}
          figure={kpis ? String(kpis.differOverDollar) : undefined}
          state={tileState(loading, kpis)}
          accent="none"
        />
        <StatTile
          label="Net delta"
          basisCaption="Invoiced minus expected"
          state={
            loading
              ? { status: "loading" }
              : kpis
                ? { status: "ready", cents: kpis.netDeltaCents }
                : { status: "empty" }
          }
          accent="none"
        />
        <StatTile
          label="Invoices with no plan month"
          basisCaption={basis}
          figure={kpis ? String(kpis.invoicesWithNoPlanMonth) : undefined}
          state={tileState(loading, kpis)}
          accent="none"
        />
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-foreground">
          {VIEW_OPTIONS.find((option) => option.value === view)?.label}
        </h2>
        {loading ? <p className="text-sm text-muted-foreground">Loading</p> : <ReportTable rows={report?.rows ?? []} />}
      </section>

      {showPairSections ? (
        <div className="mt-8 space-y-8">
          <section className="space-y-2">
            <h2 className="text-sm font-medium text-foreground">Invoices with no plan month</h2>
            <ReportTable rows={report?.unmatchedInvoices ?? []} />
          </section>
          <section className="space-y-2">
            <h2 className="text-sm font-medium text-foreground">Plan months with no invoice</h2>
            <ReportTable rows={report?.unmatchedMonths ?? []} />
          </section>
        </div>
      ) : view === "unmatched_invoices" ? (
        <section className="mt-8 space-y-2">
          <h2 className="text-sm font-medium text-foreground">Plan months with no invoice</h2>
          <ReportTable rows={report?.unmatchedMonths ?? []} />
        </section>
      ) : (
        <section className="mt-8 space-y-2">
          <h2 className="text-sm font-medium text-foreground">Invoices with no plan month</h2>
          <ReportTable rows={report?.unmatchedInvoices ?? []} />
        </section>
      )}
    </FinanceSectionsShell>
  )
}

function tileState(
  loading: boolean,
  kpis: InvoicedVsExpectedReport["kpis"] | undefined,
): { status: "loading" } | { status: "empty" } | { status: "ready"; cents: number } {
  if (loading) return { status: "loading" }
  if (!kpis) return { status: "empty" }
  return { status: "ready", cents: 0 }
}

function Filter({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {label}
      <select
        className="h-9 rounded-input border border-border bg-background px-2 text-sm text-foreground"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value || "all"} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}
