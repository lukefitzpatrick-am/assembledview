"use client"

import { Fragment, useEffect, useMemo, useState } from "react"
import { ChevronDown, ChevronRight, Download, Link2, Wrench } from "lucide-react"

import { FinanceSectionsShell } from "@/components/finance/sections/FinanceSectionsShell"
import { StatTile } from "@/components/finance/sections/StatTile"
import { TrueUpFixSheet } from "@/components/finance/sections/reports/TrueUpFixSheet"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatMoney } from "@/lib/format/money"
import { fromCents } from "@/lib/money"
import {
  TRUE_UP_COMPONENTS,
  TRUE_UP_COMPONENT_LABELS,
  TRUE_UP_STATUS_LABELS,
  financialYearStart,
  type TrueUpBillingTiming,
  type TrueUpComponent,
  type TrueUpMbaRow,
  type TrueUpReport,
  type TrueUpStatus,
} from "@/lib/finance/trueUp/compute"
import { toast } from "@/components/ui/use-toast"
import { trueUpCsvFilename } from "@/lib/finance/trueUp/csv"
import {
  filterTrueUpRows,
  sydneyTodayIso,
  trueUpMonthLabel,
  trueUpMonthOptions,
  trueUpRowSuggestions,
  type TrueUpView,
} from "@/lib/finance/trueUp/viewModel"

const VIEW_OPTIONS: { value: TrueUpView; label: string }[] = [
  { value: "action", label: "Needs action" },
  { value: "all", label: "All MBAs" },
]

const STATUS_TONE: Record<TrueUpStatus, string> = {
  gap: "text-status-critical-fg",
  ended: "text-status-critical-fg",
  no_invoice: "text-status-attention-fg",
  schedule_incomplete: "text-status-attention-fg",
  to_raise: "text-status-attention-fg",
  billed_ahead: "text-muted-foreground",
  explained: "text-muted-foreground",
  matches: "text-muted-foreground",
}

function money(cents: number): string {
  return formatMoney(fromCents(cents))
}

function gapText(cents: number, status?: TrueUpStatus): string {
  if (status === "matches") return "Matches"
  if (cents === 0) return money(0)
  return cents > 0 ? `${money(cents)} credit` : `${money(-cents)} charge`
}

function MonthDetail({ row }: { row: TrueUpMbaRow }) {
  return (
    <div className="overflow-x-auto py-2">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Month</TableHead>
            <TableHead>Invoices</TableHead>
            {TRUE_UP_COMPONENTS.map((c) => (
              <Fragment key={c}>
                <TableHead className="text-right">{TRUE_UP_COMPONENT_LABELS[c]} scheduled</TableHead>
                <TableHead className="text-right">{TRUE_UP_COMPONENT_LABELS[c]} invoiced</TableHead>
                <TableHead className="text-right">{TRUE_UP_COMPONENT_LABELS[c]} running gap</TableHead>
              </Fragment>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {row.months.map((m) => (
            <TableRow key={m.month}>
              <TableCell>{trueUpMonthLabel(m.month)}</TableCell>
              <TableCell className="whitespace-normal">
                {m.invoiceNumbers.join(", ") || "None"}
                {m.provisionalInvoiceNumbers.length > 0 ? (
                  <span className="block text-xs text-muted-foreground">
                    Provisional: {m.provisionalInvoiceNumbers.join(", ")}
                  </span>
                ) : null}
              </TableCell>
              {TRUE_UP_COMPONENTS.map((c) => (
                <Fragment key={c}>
                  <TableCell className="num text-right">{money(m.components[c].scheduled)}</TableCell>
                  <TableCell className="num text-right">
                    {money(m.components[c].invoiced)}
                    {m.components[c].provisional !== 0 ? (
                      <span className="block text-xs text-muted-foreground">
                        +{money(m.components[c].provisional)} provisional
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="num text-right">{money(m.components[c].runningGap)}</TableCell>
                </Fragment>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {row.notes.length > 0 ? <p className="mt-2 text-xs text-muted-foreground">{row.notes.join(" ")}</p> : null}
    </div>
  )
}

type ReportResponse = TrueUpReport & { actionsEnabled?: boolean }

function TrueUpTable({
  rows,
  actionsEnabled,
  onFix,
}: {
  rows: TrueUpMbaRow[]
  actionsEnabled: boolean
  onFix: (row: TrueUpMbaRow) => void
}) {
  const [open, setOpen] = useState<Set<string>>(new Set())
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">Nothing in this view.</p>
  const toggle = (mba: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(mba)) next.delete(mba)
      else next.add(mba)
      return next
    })
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-8" />
          <TableHead>Client</TableHead>
          <TableHead>MBA</TableHead>
          {TRUE_UP_COMPONENTS.map((c) => (
            <TableHead key={c} className="text-right">
              {TRUE_UP_COMPONENT_LABELS[c]}
            </TableHead>
          ))}
          <TableHead>Status</TableHead>
          <TableHead>Suggested fix</TableHead>
          {actionsEnabled ? <TableHead className="w-24" /> : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const isOpen = open.has(row.mbaNumber)
          return (
            <Fragment key={row.mbaNumber}>
              <TableRow>
                <TableCell>
                  <button
                    type="button"
                    aria-label={isOpen ? `Hide months for ${row.mbaNumber}` : `Show months for ${row.mbaNumber}`}
                    aria-expanded={isOpen}
                    onClick={() => toggle(row.mbaNumber)}
                    className="rounded p-1 hover:bg-muted"
                  >
                    {isOpen ? <ChevronDown className="h-4 w-4" aria-hidden /> : <ChevronRight className="h-4 w-4" aria-hidden />}
                  </button>
                </TableCell>
                <TableCell>{row.clientName || "Unknown client"}</TableCell>
                <TableCell>
                  {row.mbaNumber}
                  <span className="block text-xs text-muted-foreground">
                    v{row.versionNumber ?? "?"}
                    {row.hasProvisional ? " · drafts pending" : ""}
                  </span>
                </TableCell>
                {TRUE_UP_COMPONENTS.map((c: TrueUpComponent) => {
                  const s = row.components[c]
                  return (
                    <TableCell key={c} className={`num text-right ${STATUS_TONE[s.status]}`}>
                      {gapText(s.uncoveredGap, s.status)}
                      {s.status !== "matches" ? (
                        <span className="block text-xs text-muted-foreground">{TRUE_UP_STATUS_LABELS[s.status]}</span>
                      ) : null}
                    </TableCell>
                  )
                })}
                <TableCell className={STATUS_TONE[row.status]}>{TRUE_UP_STATUS_LABELS[row.status]}</TableCell>
                <TableCell className="max-w-md whitespace-normal text-sm">
                  {trueUpRowSuggestions(row).map((line) => (
                    <span key={line} className="block">
                      {line}
                    </span>
                  ))}
                </TableCell>
                {actionsEnabled ? (
                  <TableCell>
                    <Button variant="outline" size="sm" onClick={() => onFix(row)} aria-label={`Fix ${row.mbaNumber}`}>
                      <Wrench className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                      Fix
                    </Button>
                  </TableCell>
                ) : null}
              </TableRow>
              {isOpen ? (
                <TableRow>
                  <TableCell colSpan={4 + TRUE_UP_COMPONENTS.length + 1 + (actionsEnabled ? 1 : 0)}>
                    <MonthDetail row={row} />
                  </TableCell>
                </TableRow>
              ) : null}
            </Fragment>
          )
        })}
      </TableBody>
    </Table>
  )
}

function LinkInvoiceForm({ invoice, onLinked }: { invoice: string; onLinked: () => void }) {
  const [mba, setMba] = useState("")
  const [month, setMonth] = useState("")
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    setBusy(true)
    try {
      const res = await fetch("/api/finance/true-up/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoice, mbaNumber: mba.trim(), billingMonth: month || null }),
      })
      const body = (await res.json().catch(() => ({}))) as { message?: string }
      if (!res.ok) throw new Error(body.message ?? "Could not link the invoice.")
      toast({ title: "Linked", description: `${invoice} now counts for ${mba.trim()}.` })
      onLinked()
    } catch (e) {
      toast({ title: "Not linked", description: e instanceof Error ? e.message : "Could not link the invoice.", variant: "destructive" })
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-1">
      <input
        className="h-8 w-28 rounded-input border border-border bg-background px-2 text-xs"
        placeholder="MBA"
        aria-label={`MBA for ${invoice}`}
        value={mba}
        onChange={(e) => setMba(e.target.value)}
      />
      <input
        className="h-8 w-28 rounded-input border border-border bg-background px-2 text-xs"
        type="month"
        aria-label={`Billing month for ${invoice} (optional)`}
        value={month}
        onChange={(e) => setMonth(e.target.value)}
      />
      <Button variant="outline" size="sm" disabled={busy || !mba.trim()} onClick={() => void submit()}>
        <Link2 className="mr-1 h-3.5 w-3.5" aria-hidden />
        Link
      </Button>
    </div>
  )
}

function UnattributedTable({
  report,
  actionsEnabled,
  onLinked,
}: {
  report: TrueUpReport
  actionsEnabled: boolean
  onLinked: () => void
}) {
  if (report.unattributed.length === 0) {
    return <p className="text-sm text-muted-foreground">Every invoice line in scope found its MBA.</p>
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Invoice</TableHead>
          <TableHead>Issued</TableHead>
          <TableHead>Reference</TableHead>
          <TableHead>Component</TableHead>
          <TableHead className="text-right">Amount</TableHead>
          <TableHead>Why</TableHead>
          {actionsEnabled ? <TableHead>Link to an MBA</TableHead> : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {report.unattributed.map((u, i) => (
          <TableRow key={`${u.xeroInvoiceId}-${i}`}>
            <TableCell>
              {u.invoiceNumber}
              {u.state === "provisional" ? <span className="block text-xs text-muted-foreground">Provisional</span> : null}
            </TableCell>
            <TableCell>{u.issueDate ?? ""}</TableCell>
            <TableCell className="max-w-xs whitespace-normal">{u.reference || "No reference"}</TableCell>
            <TableCell>{TRUE_UP_COMPONENT_LABELS[u.component]}</TableCell>
            <TableCell className="num text-right">{money(u.cents)}</TableCell>
            <TableCell>{u.reason === "no_mba" ? "No MBA found" : "MBA has no published plan"}</TableCell>
            {actionsEnabled ? (
              <TableCell>
                <LinkInvoiceForm invoice={u.invoiceNumber || u.xeroInvoiceId} onLinked={onLinked} />
              </TableCell>
            ) : null}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export function TrueUpPageClient() {
  const today = useMemo(() => sydneyTodayIso(), [])
  const monthOptions = useMemo(() => trueUpMonthOptions(today), [today])
  const [asOf, setAsOf] = useState<string>(() => monthOptions[0]!)
  const [view, setView] = useState<TrueUpView>("action")
  const [search, setSearch] = useState("")
  const [report, setReport] = useState<ReportResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [reload, setReload] = useState(0)
  const [fixRow, setFixRow] = useState<TrueUpMbaRow | null>(null)
  const from = financialYearStart(asOf)
  const currentMonth = today.slice(0, 7)

  useEffect(() => {
    const params = new URLSearchParams({ asOf, from })
    const ac = new AbortController()
    setLoading(true)
    setError(null)
    void fetch(`/api/finance/reports/true-up?${params}`, { signal: ac.signal })
      .then(async (res) => {
        const body = (await res.json()) as ReportResponse & { message?: string }
        if (!res.ok) throw new Error(body.message ?? "Could not load the true-up.")
        setReport(body)
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return
        setError(err instanceof Error ? err.message : "Could not load the true-up.")
        setReport(null)
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false)
      })
    return () => ac.abort()
  }, [asOf, from, reload])

  const actionsEnabled = report?.actionsEnabled === true
  const refresh = () => setReload((n) => n + 1)
  // Keep the open sheet on the fresh row after a change.
  const fixRowFresh = fixRow ? (report?.rows.find((r) => r.mbaNumber === fixRow.mbaNumber) ?? fixRow) : null

  const rows = useMemo(() => filterTrueUpRows(report?.rows ?? [], view, search), [report, view, search])
  const basis = `${trueUpMonthLabel(from)} to ${trueUpMonthLabel(asOf)}`
  const totals = report?.totals
  const csvParams = new URLSearchParams({ asOf, from, format: "csv" })
  const moneyState = (cents: number | undefined) =>
    loading ? { status: "loading" as const } : cents == null ? { status: "empty" as const } : { status: "ready" as const, cents }

  return (
    <FinanceSectionsShell
      title="True-up"
      headerNote="Ex GST. Invoiced (sent and approved in Xero) against the billing schedule on each published plan, to the end of the month. Plus is a credit due to the client, minus is a charge. Gaps under $1 are ignored. Fixes change the billing schedule only, never delivery."
      scopeBarFramed
      scopeBar={
        <div className="flex flex-wrap items-end gap-3">
          <Filter
            label="To the end of"
            value={asOf}
            onChange={setAsOf}
            options={monthOptions.map((m) => ({ value: m, label: trueUpMonthLabel(m) }))}
          />
          <Filter label="View" value={view} onChange={(v) => setView(v as TrueUpView)} options={VIEW_OPTIONS} />
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Search
            <input
              className="h-9 rounded-input border border-border bg-background px-2 text-sm text-foreground"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Client or MBA"
            />
          </label>
          <Button variant="outline" size="sm" asChild>
            <a href={`/api/finance/reports/true-up?${csvParams}`}>
              <Download className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              {trueUpCsvFilename(asOf)}
            </a>
          </Button>
        </div>
      }
    >
      {error ? <p className="mb-4 text-sm text-status-critical-fg">{error}</p> : null}
      {report ? (
        <p className="mb-4 text-xs text-muted-foreground">
          {report.xeroSyncedAt
            ? `Xero last synced ${new Date(report.xeroSyncedAt).toLocaleString("en-AU", { timeZone: "Australia/Sydney" })}. `
            : ""}
          {report.provisionalInvoices > 0
            ? `${report.provisionalInvoices} draft or unsent invoice${report.provisionalInvoices === 1 ? " is" : "s are"} shown as provisional and not counted.`
            : "No draft invoices in this window."}
        </p>
      ) : null}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatTile
          label="MBAs needing action"
          basisCaption={basis}
          figure={totals ? String(totals.mbasNeedingAction) : undefined}
          state={loading ? { status: "loading" } : totals ? { status: "ready", cents: 0 } : { status: "empty" }}
          accent="none"
        />
        {TRUE_UP_COMPONENTS.map((c) => (
          <StatTile
            key={c}
            label={`${TRUE_UP_COMPONENT_LABELS[c]} net gap`}
            basisCaption="Plus credit, minus charge"
            state={moneyState(totals?.gapByComponent[c])}
            accent="none"
          />
        ))}
      </div>

      <section className="mb-8 space-y-2">
        <h2 className="text-sm font-medium text-foreground">By MBA</h2>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading</p>
        ) : (
          <TrueUpTable rows={rows} actionsEnabled={actionsEnabled} onFix={setFixRow} />
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-foreground">Invoice lines with no MBA</h2>
        {loading || !report ? null : <UnattributedTable report={report} actionsEnabled={actionsEnabled} onLinked={refresh} />}
      </section>

      {actionsEnabled && fixRowFresh ? (
        <TrueUpFixSheet
          key={`${fixRowFresh.mbaNumber}-${fixRowFresh.versionId}`}
          row={fixRowFresh}
          asOf={asOf}
          from={from}
          currentMonth={currentMonth}
          timing={(report?.billingTiming?.[String(fixRowFresh.clientsId ?? "")] as TrueUpBillingTiming | undefined) ?? "same_month"}
          open
          onOpenChange={(o) => {
            if (!o) setFixRow(null)
          }}
          onChanged={refresh}
        />
      ) : null}
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
