"use client"

import { Fragment, useState } from "react"
import { format } from "date-fns"
import { ChevronDown, ChevronRight, Download } from "lucide-react"
import { saveAs } from "file-saver"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states"
import { useToast } from "@/components/ui/use-toast"
import {
  buildTargetVsActualWorkbook,
  targetVsActualExportFilenameStem,
} from "@/lib/finance/forecast/exportTargetVsActual"
import { workbookToXlsxBuffer } from "@/lib/finance/excelFinanceExport"
import type {
  TargetVsActualRag,
  TargetVsActualReport,
} from "@/lib/finance/forecast/variance/targetVsActual"
import { formatAUD } from "@/lib/format/money"
import { cn } from "@/lib/utils"
import type { FinanceForecastMonthKey, FinanceForecastScenario } from "@/lib/types/financeForecast"

function monthLabel(key: FinanceForecastMonthKey, fyStart: number): string {
  const calMonth: Record<FinanceForecastMonthKey, number> = {
    july: 7,
    august: 8,
    september: 9,
    october: 10,
    november: 11,
    december: 12,
    january: 1,
    february: 2,
    march: 3,
    april: 4,
    may: 5,
    june: 6,
  }
  const m = calMonth[key]
  const year = m >= 7 ? fyStart : fyStart + 1
  return format(new Date(year, m - 1, 1), "MMM yy")
}

function ragClass(rag: TargetVsActualRag): string {
  switch (rag) {
    case "ahead":
      return "bg-pacing-ahead-bg text-status-ahead-fg"
    case "on_track":
      return "bg-pacing-on-track-bg text-status-on-track-fg"
    case "behind":
      return "bg-pacing-behind-bg text-status-behind-fg"
    case "critical":
      return "bg-pacing-critical-bg text-status-critical-fg"
    default:
      return "bg-surface-panel text-muted-foreground"
  }
}

function formatPct(pct: number | null): string {
  if (pct == null || !Number.isFinite(pct)) return "—"
  const sign = pct > 0 ? "+" : ""
  return `${sign}${pct.toFixed(1)}%`
}

export type VarianceTargetVsActualViewProps = {
  fyStart: number
  scenario: FinanceForecastScenario
  clientFilter: string
  expandedClientIds: Set<string>
  onToggleClient: (clientId: string) => void
}

export function VarianceTargetVsActualView({
  fyStart,
  scenario,
  clientFilter,
  expandedClientIds,
  onToggleClient,
}: VarianceTargetVsActualViewProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [report, setReport] = useState<TargetVsActualReport | null>(null)

  const loadVariance = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/finance/forecast/variance/target-vs-actual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fy: fyStart,
          scenario,
          client_id: clientFilter.trim() || undefined,
        }),
      })
      let body: { ok?: boolean; report?: TargetVsActualReport; message?: string; error?: string } = {}
      try {
        body = (await res.json()) as typeof body
      } catch {
        body = {}
      }
      if (!res.ok || !body.report) {
        throw new Error(body.message || body.error || `Request failed (${res.status})`)
      }
      setReport(body.report)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      setReport(null)
      toast({
        variant: "destructive",
        title: "Variance load failed",
        description: msg,
      })
    } finally {
      setLoading(false)
    }
  }

  const runExport = async () => {
    if (!report) return
    setExporting(true)
    try {
      const at = new Date()
      const workbook = await buildTargetVsActualWorkbook(report, at)
      const buffer = await workbookToXlsxBuffer(workbook)
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      })
      saveAs(blob, `${targetVsActualExportFilenameStem(report, at)}.xlsx`)
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Export failed",
        description: e instanceof Error ? e.message : String(e),
      })
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card className="rounded-card border-border shadow-e1">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
          <div className="space-y-0.5">
            <CardTitle className="text-base font-medium">Target vs actual</CardTitle>
            <p className="text-xs text-muted-foreground">
              Phase 1: target (A1) vs billed_amount actual · booked schedules as reference · client ×
              month grain
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" className="h-9" disabled={loading} onClick={() => void loadVariance()}>
              {loading ? "Loading…" : report ? "Reload variance" : "Load variance"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-9"
              disabled={!report || exporting}
              onClick={() => void runExport()}
            >
              <Download className="mr-2 h-4 w-4" />
              {exporting ? "Exporting…" : "Export Excel"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? <LoadingState rows={5} /> : null}
          {!loading && error ? (
            <ErrorState title="Could not load variance" message={error} onRetry={() => void loadVariance()} />
          ) : null}
          {!loading && !error && !report ? (
            <EmptyState
              title="No variance loaded"
              message="Load variance to compare targets against billed actuals for this financial year."
            />
          ) : null}
          {!loading && report ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[52rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface-panel">
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Client / month
                    </th>
                    <th className="px-2 py-2 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Target
                    </th>
                    <th className="px-2 py-2 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Actual
                    </th>
                    <th className="px-2 py-2 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Delta
                    </th>
                    <th className="px-2 py-2 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Delta %
                    </th>
                    <th className="px-2 py-2 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Booked (ref)
                    </th>
                    <th className="px-2 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {report.clients.map((client) => {
                    const expanded = expandedClientIds.has(client.client_id)
                    return (
                      <Fragment key={client.client_id}>
                        <tr className="border-b border-border bg-card hover:bg-table-row-hover">
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              className="interactive-tint flex items-center gap-1.5 text-left text-sm font-medium text-foreground"
                              onClick={() => onToggleClient(client.client_id)}
                              aria-expanded={expanded}
                            >
                              {expanded ? (
                                <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
                              )}
                              {client.client_name}
                            </button>
                          </td>
                          <td className="num px-2 py-2 text-right font-mono text-xs">{formatAUD(client.fy.target)}</td>
                          <td className="num px-2 py-2 text-right font-mono text-xs">{formatAUD(client.fy.actual)}</td>
                          <td className="num px-2 py-2 text-right font-mono text-xs">{formatAUD(client.fy.delta)}</td>
                          <td className="num px-2 py-2 text-right font-mono text-xs">{formatPct(client.fy.delta_pct)}</td>
                          <td className="num px-2 py-2 text-right font-mono text-xs text-muted-foreground">
                            {formatAUD(client.fy.booked)}
                          </td>
                          <td className="px-2 py-2">
                            <span
                              className={cn(
                                "rounded-pill px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                                ragClass(client.fy.rag)
                              )}
                            >
                              {client.fy.rag.replace("_", " ")}
                            </span>
                          </td>
                        </tr>
                        {expanded
                          ? client.months.map((month) => (
                              <tr
                                key={`${client.client_id}-${month.month_key}`}
                                className="border-b border-border/60 bg-surface-panel/40"
                              >
                                <td className="px-3 py-1.5 pl-10 text-xs text-muted-foreground">
                                  {monthLabel(month.month_key, report.financial_year_start_year)}
                                </td>
                                <td className="num px-2 py-1.5 text-right font-mono text-xs">
                                  {formatAUD(month.target)}
                                </td>
                                <td className="num px-2 py-1.5 text-right font-mono text-xs">
                                  {formatAUD(month.actual)}
                                </td>
                                <td className="num px-2 py-1.5 text-right font-mono text-xs">
                                  {formatAUD(month.delta)}
                                </td>
                                <td className="num px-2 py-1.5 text-right font-mono text-xs">
                                  {formatPct(month.delta_pct)}
                                </td>
                                <td className="num px-2 py-1.5 text-right font-mono text-xs text-muted-foreground">
                                  {formatAUD(month.booked)}
                                </td>
                                <td className="px-2 py-1.5">
                                  <span
                                    className={cn(
                                      "rounded-pill px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                                      ragClass(month.rag)
                                    )}
                                  >
                                    {month.rag.replace("_", " ")}
                                  </span>
                                </td>
                              </tr>
                            ))
                          : null}
                      </Fragment>
                    )
                  })}
                  <tr className="border-t border-border bg-surface-panel font-semibold">
                    <td className="px-3 py-2 text-xs">Portfolio FY</td>
                    <td className="num px-2 py-2 text-right font-mono text-xs">{formatAUD(report.totals.target)}</td>
                    <td className="num px-2 py-2 text-right font-mono text-xs">{formatAUD(report.totals.actual)}</td>
                    <td className="num px-2 py-2 text-right font-mono text-xs">{formatAUD(report.totals.delta)}</td>
                    <td className="num px-2 py-2 text-right font-mono text-xs">{formatPct(report.totals.delta_pct)}</td>
                    <td className="num px-2 py-2 text-right font-mono text-xs text-muted-foreground">
                      {formatAUD(report.totals.booked)}
                    </td>
                    <td className="px-2 py-2">
                      <span
                        className={cn(
                          "rounded-pill px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                          ragClass(report.totals.rag)
                        )}
                      >
                        {report.totals.rag.replace("_", " ")}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
