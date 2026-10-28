"use client"

import { Fragment, useCallback, useEffect, useMemo, useState } from "react"
import { saveAs } from "file-saver"
import { Download } from "lucide-react"
import { CostsSubNav } from "@/components/finance/sections/costs/CostsSubNav"
import { EmptyState } from "@/components/finance/sections/EmptyState"
import { ErrorState } from "@/components/finance/sections/ErrorState"
import { LoadingState } from "@/components/finance/sections/LoadingState"
import { SectionScopeBar } from "@/components/finance/sections/SectionScopeBar"
import { StatTile, type StatTileMoneyState } from "@/components/finance/sections/StatTile"
import { FinanceSectionsShell } from "@/components/finance/sections/FinanceSectionsShell"
import { Panel, PanelContent, PanelHeader, PanelTitle } from "@/components/layout/Panel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Segmented, SegmentedItem } from "@/components/ui/segmented"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { fetchFinanceSectionsJson } from "@/lib/finance/sections/api"
import {
  filterFixedCostMarginLines,
  NO_BILL_YET_LABEL,
  NO_COST_IN_FEED_LABEL,
  NO_PLATFORM_DATA_LABEL,
  OUT_OF_RANGE_LABEL,
  PENDING_BILLS_LABEL,
  summariseFixedCostMargin,
  type Dv360CheckRow,
  type FinanceFixedCostMarginPayload,
  type FixedCostBillLineView,
  type FixedCostMarginLine,
  type MarginSummary,
  type MarginTotals,
} from "@/lib/finance/sections/fixedCostMargin/compose"
import {
  billMethodLabel,
  billStateLabel,
  downloadFixedCostMarginWorkbook,
} from "@/lib/finance/sections/fixedCostMargin/excel"
import { fyDisplayLabel } from "@/lib/finance/months"
import { formatMoney } from "@/lib/format/money"
import {
  useFinanceScopeApplied,
  useFinanceScopeStore,
  useFinanceScopeVersion,
} from "@/lib/finance/sections/useFinanceScope"
import type { ViewState } from "@/lib/ui/viewState"
import { cn } from "@/lib/utils"

const ALL = "__all__"

type ViewMode = "margin" | "timing" | "bills"
type BillFilter = "needs" | "matched" | "fee" | "production" | "all"

const BILL_FILTERS: Array<{ value: BillFilter; label: string }> = [
  { value: "needs", label: "To match by hand" },
  { value: "matched", label: "Matched" },
  { value: "fee", label: "Fees" },
  { value: "production", label: "Production" },
  { value: "all", label: "All bill lines" },
]

function billFilterMatches(b: FixedCostBillLineView, f: BillFilter): boolean {
  if (f === "all") return true
  if (f === "needs") return b.state === "ambiguous" || b.state === "unmatched"
  return b.state === f
}

function monthLabel(yyyyMm: string): string {
  const [y, m] = yyyyMm.split("-")
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  const mi = Number.parseInt(m ?? "1", 10) - 1
  return `${months[mi] ?? m} ${String(y ?? "").slice(2)}`
}

function money(cents: number | null | undefined): string {
  if (cents == null) return "—"
  return formatMoney(cents / 100)
}

function pct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—"
  return `${(value * 100).toFixed(1)}%`
}

function marginClass(cents: number | null | undefined): string {
  return cents != null && cents < 0 ? "text-status-critical-fg font-semibold" : ""
}

function tileState(
  view: ViewState<FinanceFixedCostMarginPayload>,
  summary: MarginSummary | null,
  pick: (t: MarginTotals) => number
): StatTileMoneyState {
  if (view.status === "loading") return { status: "loading" }
  if (view.status === "error") return { status: "error", message: view.message }
  if (view.status !== "ready" || !summary) return { status: "empty" }
  return { status: "ready", cents: pick(summary.grand) }
}

function LineFlags({ line }: { line: FixedCostMarginLine }) {
  return (
    <span className="flex flex-wrap gap-1">
      {line.flags.noPlatformData ? (
        <Badge variant="neutral" size="sm">
          {NO_PLATFORM_DATA_LABEL}
        </Badge>
      ) : null}
      {line.flags.noCostInFeed ? (
        <Badge variant="neutral" size="sm">
          {NO_COST_IN_FEED_LABEL}
        </Badge>
      ) : null}
      {line.flags.noBillYet ? (
        <Badge variant="neutral" size="sm">
          {NO_BILL_YET_LABEL}
        </Badge>
      ) : null}
      {line.flags.pendingBills ? (
        <Badge variant="attention" size="sm">
          {PENDING_BILLS_LABEL}
        </Badge>
      ) : null}
      {line.flags.negativeMargin ? (
        <Badge variant="critical" size="sm">
          Negative margin
        </Badge>
      ) : null}
      {line.flags.outOfRangeMonths.length ? (
        <Badge variant="attention" size="sm">
          {OUT_OF_RANGE_LABEL}
        </Badge>
      ) : null}
    </span>
  )
}

function TotalsCells({
  t,
  strong = false,
  withBills = false,
}: {
  t: MarginTotals
  strong?: boolean
  withBills?: boolean
}) {
  const cls = cn("num px-2 py-1.5 text-right", strong && "font-semibold")
  return (
    <>
      <td className={cls}>{money(t.billedCents)}</td>
      <td className={cls}>{money(t.invoicedCents)}</td>
      <td className={cls}>{money(t.actualCents)}</td>
      <td className={cn(cls, marginClass(t.marginCents))}>
        {t.billedWithCostCents || t.actualCents ? money(t.marginCents) : "—"}
      </td>
      <td className={cn(cls, marginClass(t.marginCents))}>{pct(t.marginPct)}</td>
      {withBills ? (
        <>
          <td className={cn(cls, "text-muted-foreground")}>{t.billGrossCents ? money(t.billGrossCents) : "—"}</td>
          <td className={cn(cls, "text-muted-foreground")}>{t.billRebateCents ? money(t.billRebateCents) : "—"}</td>
          <td className={cn(cls, "text-muted-foreground")}>{t.pendingBillCents ? money(t.pendingBillCents) : "—"}</td>
        </>
      ) : null}
    </>
  )
}

function TimingTable({
  clients,
  currentMonth,
}: {
  clients: Array<{ clientId: number; clientName: string; lines: FixedCostMarginLine[] }>
  currentMonth: string
}) {
  const cell = "num px-2 py-1 text-right"
  return (
    <div className="overflow-x-auto rounded-card border border-border bg-card shadow-e1">
      <table className="w-full min-w-[1100px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className="sticky left-0 z-10 bg-card px-3 py-2 font-medium">Client / line / month</th>
            <th className="px-2 py-2 font-medium">Cost from</th>
            <th className="px-2 py-2 text-right font-medium">Cost, billed month</th>
            <th className="px-2 py-2 text-right font-medium">Cost, delivered month</th>
            <th className="px-2 py-2 text-right font-medium">Difference</th>
            <th className="px-2 py-2 text-right font-medium">Client billed</th>
            <th className="px-2 py-2 text-right font-medium">Client delivery</th>
            <th className="px-2 py-2 text-right font-medium">Difference</th>
          </tr>
        </thead>
        <tbody>
          {clients.map((client) => (
            <Fragment key={`t-${client.clientId}`}>
              <tr className="border-b border-border/80 bg-surface-panel">
                <td className="sticky left-0 z-10 bg-surface-panel px-3 py-2 font-semibold text-foreground" colSpan={8}>
                  {client.clientName}
                </td>
              </tr>
              {client.lines.map((line) => (
                <Fragment key={`t-${line.key}`}>
                  <tr className="border-b border-border/60">
                    <td className="sticky left-0 z-10 bg-card px-3 py-1.5 pl-6 text-foreground" colSpan={8}>
                      <span className="font-medium">{line.mbaNumber}</span>
                      <span className="ml-2 text-muted-foreground">{line.lineItemId}</span>
                      <span className="ml-2 text-muted-foreground">{line.publisher}</span>
                    </td>
                  </tr>
                  {line.timing.map((t) => (
                    <tr key={`t-${line.key}-${t.month}`} className="interactive-row border-b border-border/40">
                      <td className="sticky left-0 z-10 bg-card px-3 py-1 pl-10 text-muted-foreground">
                        {monthLabel(t.month)}
                        {t.month === currentMonth ? " (to date)" : ""}
                      </td>
                      <td className="px-2 py-1 text-muted-foreground">
                        {line.costBasis === "xero_bill" ? "Xero bills" : "Platform spend"}
                      </td>
                      <td className={cell}>{money(t.costBilledMonthCents)}</td>
                      <td className={cell}>{money(t.costDeliveredMonthCents)}</td>
                      <td className={cn(cell, marginClass(t.costDiffCents))}>{money(t.costDiffCents)}</td>
                      <td className={cell}>{money(t.clientBilledCents)}</td>
                      <td className={cell}>{money(t.clientDeliveryCents)}</td>
                      <td className={cn(cell, marginClass(t.clientDiffCents))}>{money(t.clientDiffCents)}</td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function BillLinesPanel({ data }: { data: FinanceFixedCostMarginPayload }) {
  const [filter, setFilter] = useState<BillFilter>("needs")
  const rows = useMemo(() => data.billLines.filter((b) => billFilterMatches(b, filter)), [data.billLines, filter])
  const cell = "num px-2 py-1 text-right"
  return (
    <div className="space-y-4">
      <Panel>
        <PanelHeader>
          <PanelTitle>Bill match totals (ex GST, gross, bills issued in range)</PanelTitle>
        </PanelHeader>
        <PanelContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="px-2 py-2 font-medium">Supplier</th>
                  <th className="px-2 py-2 text-right font-medium">Lines</th>
                  <th className="px-2 py-2 text-right font-medium">Gross</th>
                  <th className="px-2 py-2 text-right font-medium">Matched</th>
                  <th className="px-2 py-2 text-right font-medium">In this report</th>
                  <th className="px-2 py-2 text-right font-medium">Ambiguous</th>
                  <th className="px-2 py-2 text-right font-medium">Unmatched</th>
                  <th className="px-2 py-2 text-right font-medium">Fees</th>
                  <th className="px-2 py-2 text-right font-medium">Production</th>
                  <th className="px-2 py-2 text-right font-medium">Pending</th>
                </tr>
              </thead>
              <tbody>
                {data.billTotals.map((t) => (
                  <tr key={t.supplierKind} className="border-b border-border/40">
                    <td className="px-2 py-1.5 text-foreground">{t.supplierKind.replace(/_/g, " ")}</td>
                    <td className={cell}>{t.lines}</td>
                    <td className={cell}>{money(t.totalCents)}</td>
                    <td className={cell}>{money(t.matchedCents)}</td>
                    <td className={cell}>{money(t.matchedInReportCents)}</td>
                    <td className={cell}>{money(t.ambiguousCents)}</td>
                    <td className={cell}>{money(t.unmatchedCents)}</td>
                    <td className={cell}>{money(t.feeCents)}</td>
                    <td className={cell}>{money(t.productionCents)}</td>
                    <td className={cell}>{money(t.pendingCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </PanelContent>
      </Panel>

      <div className="flex flex-wrap items-center gap-3">
        <Segmented value={filter} onValueChange={(v) => v && setFilter(v as BillFilter)}>
          {BILL_FILTERS.map((f) => (
            <SegmentedItem key={f.value} value={f.value}>
              {f.label}
            </SegmentedItem>
          ))}
        </Segmented>
        <span className="text-xs text-muted-foreground">{rows.length} bill lines</span>
      </div>

      <div className="overflow-x-auto rounded-card border border-border bg-card shadow-e1">
        <table className="w-full min-w-[1300px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="px-2 py-2 font-medium">Supplier / bill</th>
              <th className="px-2 py-2 font-medium">Status</th>
              <th className="px-2 py-2 font-medium">Billed / delivered</th>
              <th className="px-2 py-2 font-medium">Description</th>
              <th className="px-2 py-2 font-medium">Publisher</th>
              <th className="px-2 py-2 font-medium">MBA</th>
              <th className="px-2 py-2 font-medium">Line</th>
              <th className="px-2 py-2 font-medium">Match</th>
              <th className="px-2 py-2 text-right font-medium">Gross</th>
              <th className="px-2 py-2 text-right font-medium">Rebate</th>
              <th className="px-2 py-2 text-right font-medium">Net</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.key} className="interactive-row border-b border-border/40 align-top">
                <td className="px-2 py-1">
                  <span className="block text-foreground">{b.supplierKind}</span>
                  <span className="block text-xs text-muted-foreground">{b.invoiceNumber}</span>
                </td>
                <td className="px-2 py-1">
                  <Badge variant={b.statusClass === "counted" ? "neutral" : "attention"} size="sm">
                    {b.status}
                  </Badge>
                </td>
                <td className="px-2 py-1 text-muted-foreground">
                  {monthLabel(b.billedMonth)}
                  {b.deliveredMonth !== b.billedMonth ? ` / ${monthLabel(b.deliveredMonth)}` : ""}
                </td>
                <td className="max-w-[320px] px-2 py-1 text-muted-foreground">{b.description}</td>
                <td className="px-2 py-1">{b.publisher ?? (b.mediaOwnerText || "—")}</td>
                <td className="px-2 py-1">{b.mbaNumber ?? "—"}</td>
                <td className="px-2 py-1">
                  {b.lineItemId ?? (b.candidates.length ? b.candidates.join(", ") : "—")}
                  {b.lineItemId && !b.inReport ? (
                    <span className="block text-xs text-muted-foreground">not fixed cost</span>
                  ) : null}
                </td>
                <td className="max-w-[280px] px-2 py-1">
                  <span className="block text-foreground">{billStateLabel(b.state)}</span>
                  <span className="block text-xs text-muted-foreground">
                    {b.method ? billMethodLabel(b.method) : b.reason}
                  </span>
                </td>
                <td className={cell}>{money(b.grossCents)}</td>
                <td className={cell}>{b.rebateCents ? money(b.rebateCents) : "—"}</td>
                <td className={cell}>{money(b.netCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Dv360CheckPanel({
  rows,
  note,
  ok,
  unmatchedLines,
  unmatchedCents,
}: {
  rows: Dv360CheckRow[]
  note: string
  ok: boolean
  unmatchedLines: number
  unmatchedCents: number
}) {
  const cell = "num px-2 py-1.5 text-right"
  return (
    <Panel>
      <PanelHeader>
        <PanelTitle>DV360 cost vs Five Stones bills (by MBA-month)</PanelTitle>
      </PanelHeader>
      <PanelContent>
        <p className="mb-3 text-xs text-muted-foreground">
          {note}
          {unmatchedLines
            ? ` ${unmatchedLines} Five Stones DV360 bill lines (${money(unmatchedCents)}) name no MBA, or more than one, and are not matched.`
            : ""}
        </p>
        {!ok || rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {ok ? "No Five Stones DV360 bill matches a DV360 line in this scope." : "Not available for this load."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="px-2 py-2 font-medium">Client / MBA</th>
                  <th className="px-2 py-2 font-medium">Month</th>
                  <th className="px-2 py-2 font-medium">Report DV360 lines</th>
                  <th className="px-2 py-2 text-right font-medium">DV360 AMOUNT_SPENT (all MBA lines)</th>
                  <th className="px-2 py-2 text-right font-medium">Five Stones bill</th>
                  <th className="px-2 py-2 text-right font-medium">Gap $</th>
                  <th className="px-2 py-2 text-right font-medium">Gap %</th>
                  <th className="px-2 py-2 font-medium">Bill status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.mbaNumber}-${r.month}`} className="border-b border-border/40">
                    <td className="px-2 py-1.5 text-foreground">
                      <span className="block">{r.clientName}</span>
                      <span className="block text-xs text-muted-foreground">{r.mbaNumber}</span>
                    </td>
                    <td className="px-2 py-1.5 text-muted-foreground">{monthLabel(r.month)}</td>
                    <td className="px-2 py-1.5 text-muted-foreground">{r.lineItemIds.join(", ")}</td>
                    <td className={cell}>{money(r.mbaDv360SpendCents)}</td>
                    <td className={cell}>
                      {money(r.fiveStonesBillCents)}
                      {r.pendingBillCents ? (
                        <span className="block text-xs text-muted-foreground">
                          pending {money(r.pendingBillCents)}
                        </span>
                      ) : null}
                    </td>
                    <td className={cn(cell, marginClass(r.gapCents))}>{money(r.gapCents)}</td>
                    <td className={cn(cell, marginClass(r.gapCents))}>{pct(r.gapPct)}</td>
                    <td className="px-2 py-1.5 text-muted-foreground">{r.statuses.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PanelContent>
    </Panel>
  )
}

function TotalsTable({
  title,
  keyHeader,
  rows,
  grand,
}: {
  title: string
  keyHeader: string
  rows: Array<{ key: string; label: string; totals: MarginTotals }>
  grand: MarginTotals
}) {
  return (
    <Panel>
      <PanelHeader>
        <PanelTitle>{title}</PanelTitle>
      </PanelHeader>
      <PanelContent>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="px-2 py-2 font-medium">{keyHeader}</th>
                <th className="px-2 py-2 text-right font-medium">Billed</th>
                <th className="px-2 py-2 text-right font-medium">Invoiced</th>
                <th className="px-2 py-2 text-right font-medium">Actual spend</th>
                <th className="px-2 py-2 text-right font-medium">Margin $</th>
                <th className="px-2 py-2 text-right font-medium">Margin %</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-b border-border/40">
                  <td className="px-2 py-1.5 text-foreground">{r.label}</td>
                  <TotalsCells t={r.totals} />
                </tr>
              ))}
              <tr className="bg-surface-panel">
                <td className="px-2 py-1.5 font-semibold text-foreground">Total</td>
                <TotalsCells t={grand} strong />
              </tr>
            </tbody>
          </table>
        </div>
      </PanelContent>
    </Panel>
  )
}

export function CostsFixedCostMarginClient() {
  const applied = useFinanceScopeApplied()
  const scopeVersion = useFinanceScopeVersion()
  const [view, setView] = useState<ViewState<FinanceFixedCostMarginPayload>>({ status: "loading" })
  const [publisher, setPublisher] = useState("")
  const [platform, setPlatform] = useState("")
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const [mode, setMode] = useState<ViewMode>("margin")

  const load = useCallback(() => {
    setView({ status: "loading" })
    const params = useFinanceScopeStore.getState().toSearchParams()
    void fetchFinanceSectionsJson<FinanceFixedCostMarginPayload>(
      "/api/finance/sections/costs/fixed-cost-margin",
      params,
      { retry: () => load() }
    ).then(setView)
  }, [])

  const clientsKey = applied.clients.join(",")
  useEffect(() => {
    load()
  }, [load, scopeVersion, applied.fy, applied.monthRange.from, applied.monthRange.to, clientsKey])

  const lines = useMemo(() => {
    if (view.status !== "ready") return []
    return filterFixedCostMarginLines(view.data.lines, {
      publishers: publisher ? [publisher] : [],
      platforms: platform ? [platform] : [],
    })
  }, [view, publisher, platform])

  const summary = useMemo(
    () => (view.status === "ready" ? summariseFixedCostMargin(lines) : null),
    [view.status, lines]
  )

  const clients = useMemo(() => {
    const map = new Map<number, { clientName: string; lines: FixedCostMarginLine[] }>()
    for (const line of lines) {
      const c = map.get(line.clientId) ?? { clientName: line.clientName, lines: [] }
      c.lines.push(line)
      map.set(line.clientId, c)
    }
    return [...map.entries()].map(([clientId, c]) => ({ clientId, ...c }))
  }, [lines])

  const dv360Rows = useMemo(() => {
    if (view.status !== "ready") return []
    const mbas = new Set(lines.map((l) => l.mbaNumber.trim().toLowerCase()))
    return (view.data.dv360Check?.rows ?? []).filter((r) => mbas.has(r.mbaNumber.trim().toLowerCase()))
  }, [view, lines])

  const clientTotals = useMemo(() => {
    const m = new Map<number, MarginTotals>()
    for (const c of summary?.byClient ?? []) m.set(c.clientId, c.totals)
    return m
  }, [summary])

  const onDownload = useCallback(async () => {
    if (view.status !== "ready" || !summary) return
    setDownloading(true)
    setDownloadError(null)
    try {
      await downloadFixedCostMarginWorkbook(
        lines,
        summary,
        [view.data.caption, view.data.spendSource.note, view.data.billSource.note, ...view.data.notes],
        { from: view.data.scope.from, to: view.data.scope.to },
        { save: saveAs },
        { billLines: view.data.billLines, billTotals: view.data.billTotals, dv360Rows }
      )
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : "Download failed")
    } finally {
      setDownloading(false)
    }
  }, [view, summary, lines, dv360Rows])

  const showingLabel =
    view.status === "ready"
      ? `Showing fixed cost margin for FY${fyDisplayLabel(view.data.scope.fy)} · ${view.data.scope.from} → ${view.data.scope.to}`
      : undefined

  const ready = view.status === "ready" ? view.data : null
  const grand = summary?.grand ?? null

  return (
    <FinanceSectionsShell
      title="Fixed cost margin"
      scopeBar={<SectionScopeBar showingLabel={showingLabel} />}
    >
      <div className="space-y-6">
        <CostsSubNav />
        <p className="text-sm text-muted-foreground">
          {ready?.caption ??
            "Fixed-cost lines billed at plan, against what the platform actually charged."}
        </p>
        {ready ? (
          <p className="text-xs text-muted-foreground">
            {ready.spendSource.note} {ready.billSource.note}
          </p>
        ) : null}

        <div className="flex flex-wrap items-end gap-3">
          <label className="space-y-1 text-xs text-muted-foreground">
            <span className="block font-medium text-foreground">Publisher</span>
            <Select value={publisher || ALL} onValueChange={(v) => setPublisher(v === ALL ? "" : v)}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="All publishers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All publishers</SelectItem>
                {(ready?.options.publishers ?? []).map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">
            <span className="block font-medium text-foreground">Platform</span>
            <Select value={platform || ALL} onValueChange={(v) => setPlatform(v === ALL ? "" : v)}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="All platforms" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All platforms</SelectItem>
                {(ready?.options.platforms ?? []).map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <Segmented value={mode} onValueChange={(v) => v && setMode(v as ViewMode)}>
            <SegmentedItem value="margin">Margin</SegmentedItem>
            <SegmentedItem value="timing">Billed vs delivered</SegmentedItem>
            <SegmentedItem value="bills">Bill lines</SegmentedItem>
          </Segmented>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void onDownload()}
            disabled={!ready || lines.length === 0 || downloading}
          >
            <Download className="mr-1.5 h-4 w-4" aria-hidden />
            {downloading ? "Preparing…" : "Download Excel"}
          </Button>
          {downloadError ? (
            <span className="text-xs text-status-critical-fg">{downloadError}</span>
          ) : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            label="Planned billed"
            basisCaption="Billing schedule, media only"
            state={tileState(view, summary, (t) => t.billedCents)}
          />
          <StatTile
            label="Invoiced"
            basisCaption="Billed in MBA-months already invoiced"
            state={tileState(view, summary, (t) => t.invoicedCents)}
          />
          <StatTile
            label="Actual cost"
            basisCaption="Platform spend, or Xero bills net of the AA rebate"
            state={tileState(view, summary, (t) => t.actualCents)}
          />
          <StatTile
            label="Margin"
            basisCaption={
              grand
                ? `${pct(grand.marginPct)} of ${money(grand.billedWithCostCents)} billed with platform cost`
                : "Billed minus actual, lines with platform cost"
            }
            state={tileState(view, summary, (t) => t.marginCents)}
            valueClassName={grand && grand.marginCents < 0 ? "text-status-critical-fg" : undefined}
          />
        </div>

        {view.status === "loading" ? <LoadingState rows={6} /> : null}
        {view.status === "error" ? (
          <ErrorState title="Unable to load fixed cost margin" message={view.message} onRetry={view.retry} />
        ) : null}
        {view.status === "ready" && lines.length === 0 ? (
          <EmptyState
            title="No fixed-cost lines"
            message="No fixed-cost media is billed or spent in this scope (approved, booked and completed published plans)."
          />
        ) : null}

        {ready && mode === "timing" && lines.length > 0 ? (
          <TimingTable clients={clients} currentMonth={ready.scope.currentMonth} />
        ) : null}
        {ready && mode === "bills" ? <BillLinesPanel data={ready} /> : null}

        {ready && mode === "margin" && lines.length > 0 && summary ? (
          <>
            <div className="overflow-x-auto rounded-card border border-border bg-card shadow-e1">
              <table className="w-full min-w-[1100px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="sticky left-0 z-10 bg-card px-3 py-2 font-medium">Client / line / month</th>
                    <th className="px-2 py-2 font-medium">Publisher</th>
                    <th className="px-2 py-2 font-medium">Spend source</th>
                    <th className="px-2 py-2 text-right font-medium">Planned billed</th>
                    <th className="px-2 py-2 text-right font-medium">Invoiced</th>
                    <th className="px-2 py-2 text-right font-medium">Actual cost</th>
                    <th className="px-2 py-2 text-right font-medium">Margin $</th>
                    <th className="px-2 py-2 text-right font-medium">Margin %</th>
                    <th className="px-2 py-2 text-right font-medium">Bill gross</th>
                    <th className="px-2 py-2 text-right font-medium">AA rebate</th>
                    <th className="px-2 py-2 text-right font-medium">Pending bills</th>
                    <th className="px-3 py-2 font-medium">Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map((client) => {
                    const ct = clientTotals.get(client.clientId)
                    return (
                      <Fragment key={`c-${client.clientId}`}>
                        <tr className="border-b border-border/80 bg-surface-panel">
                          <td
                            className="sticky left-0 z-10 bg-surface-panel px-3 py-2 font-semibold text-foreground"
                            colSpan={3}
                          >
                            {client.clientName}
                          </td>
                          {ct ? <TotalsCells t={ct} strong withBills /> : null}
                          <td className="px-3 py-2" />
                        </tr>
                        {client.lines.map((line) => (
                          <Fragment key={line.key}>
                            <tr className="border-b border-border/60">
                              <td className="sticky left-0 z-10 bg-card px-3 py-1.5 pl-6 text-foreground">
                                <span className="font-medium">{line.mbaNumber}</span>
                                <span className="ml-2 text-muted-foreground">{line.lineItemId}</span>
                                {line.lineName ? (
                                  <span className="ml-2 text-muted-foreground">{line.lineName}</span>
                                ) : null}
                              </td>
                              <td className="px-2 py-1.5">{line.publisher}</td>
                              <td className="px-2 py-1.5 text-muted-foreground">
                                {line.sources.length ? line.sources.join(", ") : "—"}
                              </td>
                              <TotalsCells t={line.totals} withBills />
                              <td className="px-3 py-1.5">
                                <LineFlags line={line} />
                              </td>
                            </tr>
                            {line.months.map((m) => (
                              <tr
                                key={`${line.key}-${m.month}`}
                                className="interactive-row border-b border-border/40"
                              >
                                <td className="sticky left-0 z-10 bg-card px-3 py-1 pl-10 text-muted-foreground">
                                  {monthLabel(m.month)}
                                  {m.month === ready.scope.currentMonth ? " (to date)" : ""}
                                </td>
                                <td className="px-2 py-1" />
                                <td className="px-2 py-1" />
                                <td className="num px-2 py-1 text-right">{money(m.billedCents)}</td>
                                <td className="num px-2 py-1 text-right text-muted-foreground">
                                  {m.invoiced ? money(m.invoicedCents) : "—"}
                                </td>
                                <td className="num px-2 py-1 text-right">
                                  {line.costStatus === "none" ||
                                  (line.costBasis === "xero_bill" && m.marginCents == null && !m.actualCents)
                                    ? "—"
                                    : money(m.actualCents)}
                                  {m.fiveStonesBillCents != null ? (
                                    <span
                                      className="block text-xs text-muted-foreground"
                                      title="Five Stones DV360 bill for the MBA-month, split by this line's DV360 spend. Not the cost."
                                    >
                                      Five Stones {money(m.fiveStonesBillCents)} · gap {money(m.fiveStonesGapCents)} (
                                      {pct(m.fiveStonesGapPct)})
                                    </span>
                                  ) : null}
                                </td>
                                <td className={cn("num px-2 py-1 text-right", marginClass(m.marginCents))}>
                                  {money(m.marginCents)}
                                </td>
                                <td className={cn("num px-2 py-1 text-right", marginClass(m.marginCents))}>
                                  {pct(m.marginPct)}
                                </td>
                                <td className="num px-2 py-1 text-right text-muted-foreground">
                                  {m.billGrossCents ? money(m.billGrossCents) : "—"}
                                </td>
                                <td className="num px-2 py-1 text-right text-muted-foreground">
                                  {m.billRebateCents ? money(m.billRebateCents) : "—"}
                                </td>
                                <td className="num px-2 py-1 text-right text-muted-foreground">
                                  {m.pendingBillCents ? money(m.pendingBillCents) : "—"}
                                </td>
                                <td className="px-3 py-1">
                                  {m.outsideLineMonths ? (
                                    <Badge variant="attention" size="sm">
                                      {OUT_OF_RANGE_LABEL}
                                    </Badge>
                                  ) : null}
                                </td>
                              </tr>
                            ))}
                          </Fragment>
                        ))}
                      </Fragment>
                    )
                  })}
                  <tr className="bg-surface-panel">
                    <td className="sticky left-0 z-10 bg-surface-panel px-3 py-2 font-semibold text-foreground" colSpan={3}>
                      Total
                    </td>
                    <TotalsCells t={summary.grand} strong withBills />
                    <td className="px-3 py-2" />
                  </tr>
                </tbody>
              </table>
            </div>

            <Dv360CheckPanel
              rows={dv360Rows}
              note={ready.dv360Check?.note ?? ""}
              ok={ready.dv360Check?.ok ?? false}
              unmatchedLines={ready.dv360Check?.unmatchedLines ?? 0}
              unmatchedCents={ready.dv360Check?.unmatchedCents ?? 0}
            />

            <div className="grid gap-4 xl:grid-cols-2">
              <TotalsTable
                title="By publisher"
                keyHeader="Publisher"
                rows={summary.byPublisher.map((p) => ({ key: p.publisher, label: p.publisher, totals: p.totals }))}
                grand={summary.grand}
              />
              <TotalsTable
                title="By month"
                keyHeader="Month"
                rows={summary.byMonth.map((m) => ({
                  key: m.month,
                  label:
                    monthLabel(m.month) + (m.month === ready.scope.currentMonth ? " (to date)" : ""),
                  totals: m.totals,
                }))}
                grand={summary.grand}
              />
            </div>
          </>
        ) : null}

        {ready ? (
          <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
            {ready.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </FinanceSectionsShell>
  )
}
