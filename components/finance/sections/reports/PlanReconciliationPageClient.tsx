"use client"

import { useEffect, useMemo, useState } from "react"
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
import { clientFeatureOn } from "@/lib/features/client"
import {
  defaultReconciliationMonth,
  planReconciliationFilename,
  reconciliationMonthOptions,
  type PlanReconciliationReport,
  type PlanReconciliationRow,
} from "@/lib/finance/planReconciliation"

type ViewChoice = "gaps" | "all"

const VIEW_OPTIONS: { value: ViewChoice; label: string }[] = [
  { value: "gaps", label: "Gaps only" },
  { value: "all", label: "All MBA-months" },
]

function money(cents: number | null): string {
  if (cents == null) return "—"
  return formatMoney(cents / 100)
}

function monthLabel(month: string): string {
  const d = new Date(`${month}-01T00:00:00Z`)
  return d.toLocaleDateString("en-AU", { month: "long", year: "numeric", timeZone: "UTC" })
}

function ReconciliationTable({ rows }: { rows: PlanReconciliationRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing in this view.</p>
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Client</TableHead>
          <TableHead>MBA</TableHead>
          <TableHead className="text-right">Plan</TableHead>
          <TableHead className="text-right">Finance</TableHead>
          <TableHead>Source</TableHead>
          <TableHead className="text-right">Export</TableHead>
          <TableHead className="text-right">Gap</TableHead>
          <TableHead>Reason</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={`${row.month}-${row.mbaNumber}`}>
            <TableCell>{row.clientName || "—"}</TableCell>
            <TableCell>{row.mbaNumber}</TableCell>
            <TableCell className="num text-right">{money(row.planCents)}</TableCell>
            <TableCell className="num text-right">{money(row.financeCents)}</TableCell>
            <TableCell>{row.financeSource || "—"}</TableCell>
            <TableCell className="num text-right">{money(row.exportCents)}</TableCell>
            <TableCell className="num text-right">{row.status === "match" ? "—" : money(row.gapCents)}</TableCell>
            <TableCell className="max-w-md whitespace-normal">{row.reasonText || "Matches"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export function PlanReconciliationPageClient() {
  const monthOptions = useMemo(() => reconciliationMonthOptions(), [])
  const [month, setMonth] = useState<string>(() => defaultReconciliationMonth())
  const [view, setView] = useState<ViewChoice>("gaps")
  const [report, setReport] = useState<PlanReconciliationReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const params = new URLSearchParams({ month, view })
    const ac = new AbortController()
    setLoading(true)
    setError(null)
    void fetch(`/api/finance/reports/plan-reconciliation?${params}`, { signal: ac.signal })
      .then(async (res) => {
        const body = (await res.json()) as PlanReconciliationReport & { message?: string }
        if (!res.ok) throw new Error(body.message ?? "Could not load the check.")
        setReport(body)
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return
        setError(err instanceof Error ? err.message : "Could not load the check.")
        setReport(null)
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false)
      })
    return () => ac.abort()
  }, [month, view])

  const exportParams = new URLSearchParams({ month, view, format: "xlsx" })
  const kpis = report?.kpis
  const basis = monthLabel(month)
  const countState = (n: number | undefined) =>
    loading ? { status: "loading" as const } : n == null ? { status: "empty" as const } : { status: "ready" as const, cents: 0 }

  return (
    <FinanceSectionsShell
      title="Plan reconciliation"
      headerNote="Read only. Ex-GST, to the cent. Plan is billing schedule_months on the published version. Finance is the approved snapshot, else the record total, else the To bill export."
      scopeBarFramed
      scopeBar={
        <div className="flex flex-wrap items-end gap-3">
          <Filter
            label="Billing month"
            value={month}
            onChange={setMonth}
            options={monthOptions.map((m) => ({ value: m, label: monthLabel(m) }))}
          />
          <Filter
            label="View"
            value={view}
            onChange={(value) => setView(value as ViewChoice)}
            options={VIEW_OPTIONS}
          />
          <Button variant="outline" size="sm" asChild>
            <a href={`/api/finance/reports/plan-reconciliation?${exportParams}`}>
              <Download className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              {planReconciliationFilename(month)}
            </a>
          </Button>
          {clientFeatureOn("true_up") ? (
            <Button variant="outline" size="sm" asChild>
              <a href="/finance/reports/true-up">True-up</a>
            </Button>
          ) : null}
        </div>
      }
    >
      {error ? <p className="mb-4 text-sm text-status-critical-fg">{error}</p> : null}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="MBA-months"
          basisCaption={basis}
          figure={kpis ? String(kpis.mbaMonths) : undefined}
          state={countState(kpis?.mbaMonths)}
          accent="none"
        />
        <StatTile
          label="Match to the cent"
          basisCaption={basis}
          figure={kpis ? String(kpis.matched) : undefined}
          state={countState(kpis?.matched)}
          accent="none"
        />
        <StatTile
          label="Gaps"
          basisCaption={basis}
          figure={kpis ? String(kpis.gaps) : undefined}
          state={countState(kpis?.gaps)}
          accent="none"
        />
        <StatTile
          label="Net gap"
          basisCaption="Finance minus plan"
          state={
            loading
              ? { status: "loading" }
              : kpis
                ? { status: "ready", cents: kpis.netGapCents }
                : { status: "empty" }
          }
          accent="none"
        />
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-foreground">
          {VIEW_OPTIONS.find((option) => option.value === view)?.label}
        </h2>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading</p>
        ) : (
          <ReconciliationTable rows={report?.rows ?? []} />
        )}
      </section>
    </FinanceSectionsShell>
  )
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
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}
