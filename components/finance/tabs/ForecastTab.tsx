"use client"

import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { format, isValid as isValidDate } from "date-fns"
import { saveAs } from "file-saver"
import { Bug, Camera, ChevronDown, ChevronRight, Download, Info, Search } from "lucide-react"

import {
  FINANCE_FORECAST_FISCAL_MONTH_ORDER,
  FINANCE_FORECAST_GROUP_KEYS,
  FINANCE_FORECAST_GROUP_LABELS,
  FINANCE_FORECAST_LINE_LABELS,
  FINANCE_FORECAST_LINE_KEYS,
  type FinanceForecastClientBlock,
  type FinanceForecastDataset,
  type FinanceForecastLine,
  type FinanceForecastMonthlyAmounts,
  type FinanceForecastMonthKey,
  type FinanceForecastScenario,
} from "@/lib/types/financeForecast"
import {
  buildFinanceForecastCsvString,
  buildFinanceForecastWorkbook,
  financeForecastExportFilenameStem,
  type FinanceForecastExportFilterState,
} from "@/lib/finance/forecast/exportFinanceForecast"
import { workbookToXlsxBuffer } from "@/lib/finance/excelFinanceExport"
import { formatCurrencyFull } from "@/lib/format/currency"
import { cn } from "@/lib/utils"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { LoadingDots } from "@/components/ui/loading-dots"

const money = (n: number) =>
  formatCurrencyFull(n, {
    locale: "en-AU",
    currency: "AUD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

function defaultFyStartYear(): number {
  const d = new Date()
  const y = d.getFullYear()
  return d.getMonth() >= 6 ? y : y - 1
}

function monthColumnLabel(key: FinanceForecastMonthKey, fyStart: number): string {
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

type ForecastApiMeta = {
  financial_year_start_year: number
  scenario: FinanceForecastScenario
  raw_version_count: number
  filtered_version_count: number
  client_scope: "all" | "tenant_slugs"
  include_row_debug: boolean
}

type ForecastApiResponse = {
  dataset: FinanceForecastDataset
  meta: ForecastApiMeta
}

const STICKY_CLIENT = "sticky left-0 z-20 min-w-[10.5rem] w-[10.5rem] border-r border-border/60 bg-background shadow-[4px_0_12px_-8px_rgba(0,0,0,0.15)]"
const STICKY_LINE =
  "sticky left-[10.5rem] z-20 min-w-[13.5rem] w-[13.5rem] max-w-[16rem] border-r border-border/60 bg-background shadow-[4px_0_12px_-8px_rgba(0,0,0,0.15)]"
const STICKY_HEAD = "bg-muted/95 backdrop-blur-sm"

function emptyMonthlyAmounts(): FinanceForecastMonthlyAmounts {
  const m = {} as FinanceForecastMonthlyAmounts
  for (const k of FINANCE_FORECAST_FISCAL_MONTH_ORDER) m[k] = 0
  return m
}

function sumForecastLines(lines: readonly FinanceForecastLine[]): {
  monthly: FinanceForecastMonthlyAmounts
  fy: number
} {
  const monthly = emptyMonthlyAmounts()
  let fy = 0
  for (const line of lines) {
    for (const k of FINANCE_FORECAST_FISCAL_MONTH_ORDER) {
      monthly[k] += line.monthly[k] ?? 0
    }
    fy += line.fy_total
  }
  return { monthly, fy }
}

function billingGroupFromBlock(block: FinanceForecastClientBlock) {
  return block.groups.find((g) => g.group_key === FINANCE_FORECAST_GROUP_KEYS.billingBasedInformation)
}

function revenueGroupFromBlock(block: FinanceForecastClientBlock) {
  return block.groups.find((g) => g.group_key === FINANCE_FORECAST_GROUP_KEYS.revenueFeesCommission)
}

/** Prefer computed total revenue rows per client; otherwise sum non-total body lines. */
function clientRevenueSubtotalLines(block: FinanceForecastClientBlock): FinanceForecastLine[] {
  const g = revenueGroupFromBlock(block)
  if (!g) return []
  const totals = g.lines.filter((l) => l.line_key === FINANCE_FORECAST_LINE_KEYS.totalRevenue)
  if (totals.length > 0) return totals
  return g.lines.filter((l) => l.line_key !== FINANCE_FORECAST_LINE_KEYS.totalRevenue)
}

function portfolioBillingTotals(blocks: readonly FinanceForecastClientBlock[]) {
  const lines: FinanceForecastLine[] = []
  for (const b of blocks) {
    const g = billingGroupFromBlock(b)
    if (g) lines.push(...g.lines)
  }
  return sumForecastLines(lines)
}

function portfolioRevenueTotals(blocks: readonly FinanceForecastClientBlock[]) {
  const lines: FinanceForecastLine[] = []
  for (const b of blocks) lines.push(...clientRevenueSubtotalLines(b))
  return sumForecastLines(lines)
}

function combineMonthlyTotals(
  a: { monthly: FinanceForecastMonthlyAmounts; fy: number },
  b: { monthly: FinanceForecastMonthlyAmounts; fy: number }
) {
  const monthly = emptyMonthlyAmounts()
  for (const k of FINANCE_FORECAST_FISCAL_MONTH_ORDER) {
    monthly[k] = (a.monthly[k] ?? 0) + (b.monthly[k] ?? 0)
  }
  return { monthly, fy: a.fy + b.fy }
}

const SCENARIO_COPY: Record<
  FinanceForecastScenario,
  { title: string; chip: string }
> = {
  confirmed: {
    title: "Confirmed",
    chip: "Booked / approved / completed",
  },
  confirmed_plus_probable: {
    title: "Confirmed + Probable",
    chip: "All non-cancelled work",
  },
}

export function ForecastTab() {
  const [fyStart, setFyStart] = useState(() => defaultFyStartYear())
  const [scenario, setScenario] = useState<FinanceForecastScenario>("confirmed")
  const [clientFilter, setClientFilter] = useState<string>("")
  const [searchInput, setSearchInput] = useState("")
  const [includeDebug, setIncludeDebug] = useState(false)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<{ message: string; details?: string } | null>(null)
  const [payload, setPayload] = useState<ForecastApiResponse | null>(null)

  const [detailLine, setDetailLine] = useState<FinanceForecastLine | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [exporting, setExporting] = useState(false)

  const [snapshotBusy, setSnapshotBusy] = useState(false)
  const [snapshotNote, setSnapshotNote] = useState("")
  const [snapshotBanner, setSnapshotBanner] = useState<
    | null
    | {
        kind: "success"
        label: string
        taken_at: string
        line_count: number
        persisted: boolean
        snapshot_id?: string
        reason?: string
      }
    | { kind: "duplicate"; message: string; retry_after_ms: number }
    | { kind: "error"; message: string }
  >(null)

  /** Client sections expanded in the grid; omitted / not in set ⇒ collapsed (default). */
  const [expandedClientIds, setExpandedClientIds] = useState<Set<string>>(() => new Set())

  const forecastLoadSucceededRef = useRef(false)
  const loadForecastRef = useRef<() => Promise<void>>(async () => {})
  const loadAbortRef = useRef<AbortController | null>(null)
  const requestSeqRef = useRef(0)

  const fyOptions = useMemo(() => {
    const y = new Date().getFullYear()
    const out: number[] = []
    for (let i = y - 8; i <= y + 1; i++) out.push(i)
    return out.reverse()
  }, [])

  const fyLabel = (start: number) => `${start}–${String(start + 1).slice(-2)}`

  const loadForecast = useCallback(async () => {
    const requestSeq = ++requestSeqRef.current
    if (loadAbortRef.current) loadAbortRef.current.abort()
    const controller = new AbortController()
    loadAbortRef.current = controller

    setError(null)
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set("fy", String(fyStart))
      params.set("scenario", scenario)
      if (clientFilter.trim()) params.set("client", clientFilter.trim())
      if (searchInput.trim()) params.set("q", searchInput.trim())
      if (includeDebug) params.set("debug", "1")

      const res = await fetch(`/api/finance/forecast?${params.toString()}`, {
        cache: "no-store",
        signal: controller.signal,
      })
      let body: ForecastApiResponse | { error?: string; message?: string } | null = null
      try {
        body = (await res.json()) as ForecastApiResponse
      } catch {
        body = null
      }

      if (!res.ok) {
        const msg =
          (body as { message?: string })?.message ||
          (body as { error?: string })?.error ||
          `Request failed (${res.status})`
        throw new Error(msg)
      }

      if (!body || !("dataset" in body)) {
        throw new Error("Invalid response from forecast API")
      }

      if (requestSeq !== requestSeqRef.current) return
      setPayload(body as ForecastApiResponse)
      forecastLoadSucceededRef.current = true
    } catch (e) {
      if (controller.signal.aborted || requestSeq !== requestSeqRef.current) return
      forecastLoadSucceededRef.current = false
      const msg = e instanceof Error ? e.message : String(e)
      setError({
        message: "Could not load finance forecast.",
        details: msg,
      })
      setPayload(null)
    } finally {
      if (requestSeq === requestSeqRef.current) {
        setLoading(false)
      }
    }
  }, [clientFilter, fyStart, includeDebug, scenario, searchInput])

  loadForecastRef.current = loadForecast

  useEffect(() => {
    setExpandedClientIds(new Set())
  }, [payload?.dataset])

  useEffect(() => {
    if (!forecastLoadSucceededRef.current) return
    void loadForecastRef.current()
  }, [scenario])

  const toggleClientExpanded = useCallback((clientId: string) => {
    setExpandedClientIds((prev) => {
      const next = new Set(prev)
      if (next.has(clientId)) next.delete(clientId)
      else next.add(clientId)
      return next
    })
  }, [])

  const canExport =
    Boolean(payload) &&
    !loading &&
    (payload?.dataset.client_blocks.length ?? 0) > 0

  const exportFilterState = useMemo<FinanceForecastExportFilterState>(
    () => ({
      clientFilter,
      searchVersions: searchInput,
      includeRowDebug: includeDebug,
    }),
    [clientFilter, searchInput, includeDebug]
  )

  const runExportCsv = useCallback(() => {
    if (!payload || !canExport) return
    void (async () => {
      setExporting(true)
      try {
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => resolve())
        })
        const at = new Date()
        const csv = buildFinanceForecastCsvString(payload.dataset, exportFilterState, payload.meta, at)
        const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" })
        saveAs(blob, `${financeForecastExportFilenameStem(payload.dataset, at)}.csv`)
      } catch (e) {
        console.error("Forecast CSV export failed", e)
      } finally {
        setExporting(false)
      }
    })()
  }, [payload, canExport, exportFilterState])

  const runExportExcel = useCallback(() => {
    if (!payload || !canExport) return
    void (async () => {
      setExporting(true)
      try {
        await new Promise((r) => {
          requestAnimationFrame(() => r(undefined))
        })
        const at = new Date()
        const workbook = await buildFinanceForecastWorkbook(
          payload.dataset,
          exportFilterState,
          payload.meta,
          at
        )
        const buffer = await workbookToXlsxBuffer(workbook)
        const blob = new Blob([buffer], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        })
        saveAs(blob, `${financeForecastExportFilenameStem(payload.dataset, at)}.xlsx`)
      } catch (e) {
        console.error("Forecast Excel export failed", e)
      } finally {
        setExporting(false)
      }
    })()
  }, [payload, canExport, exportFilterState])

  const takeSnapshot = useCallback(
    async (forceDuplicate: boolean) => {
      setSnapshotBanner(null)
      setSnapshotBusy(true)
      try {
        const res = await fetch("/api/finance/forecast/snapshots", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            financial_year: fyStart,
            scenario,
            notes: snapshotNote.trim() || undefined,
            client: clientFilter.trim() || undefined,
            search: searchInput.trim() || undefined,
            debug: includeDebug,
            force_duplicate: forceDuplicate,
          }),
        })

        let data: Record<string, unknown> = {}
        try {
          data = (await res.json()) as Record<string, unknown>
        } catch {
          data = {}
        }

        if (res.status === 409 && data.error === "duplicate_snapshot") {
          setSnapshotBanner({
            kind: "duplicate",
            message:
              typeof data.message === "string"
                ? data.message
                : "The same forecast was just captured. You can wait, change filters, or capture again as a repeat.",
            retry_after_ms: typeof data.retry_after_ms === "number" ? data.retry_after_ms : 90_000,
          })
          return
        }

        if (!res.ok) {
          const msg =
            typeof data.message === "string"
              ? data.message
              : typeof data.error === "string"
                ? data.error
                : `Snapshot failed (${res.status})`
          setSnapshotBanner({ kind: "error", message: msg })
          return
        }

        if (data.ok === true) {
          setSnapshotBanner({
            kind: "success",
            label: String(data.snapshot_label ?? ""),
            taken_at: String(data.taken_at ?? ""),
            line_count: typeof data.line_count === "number" ? data.line_count : 0,
            persisted: data.persisted === true,
            snapshot_id: typeof data.snapshot_id === "string" ? data.snapshot_id : undefined,
            reason: typeof data.reason === "string" ? data.reason : undefined,
          })
        }
      } catch (e) {
        setSnapshotBanner({
          kind: "error",
          message: e instanceof Error ? e.message : "Snapshot request failed.",
        })
      } finally {
        setSnapshotBusy(false)
      }
    },
    [clientFilter, fyStart, includeDebug, scenario, searchInput, snapshotNote]
  )

  const colCount = 2 + FINANCE_FORECAST_FISCAL_MONTH_ORDER.length + 1
  const handleOpenDetail = useCallback((line: FinanceForecastLine) => {
    setDetailLine(line)
    setSheetOpen(true)
  }, [])

  return (
    <div className="space-y-5 p-4 md:p-6">
      <Alert className="border-amber-500/45 bg-amber-500/[0.07] dark:bg-amber-950/25">
        <Info className="h-4 w-4 text-amber-700 dark:text-amber-400" aria-hidden />
        <AlertTitle className="text-sm font-semibold text-foreground">Financial year only</AlertTitle>
        <AlertDescription className="text-sm text-muted-foreground">
          Forecast operates on the financial year, not the month range filter above.
        </AlertDescription>
      </Alert>

      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-semibold tracking-tight">Finance Forecast</h2>
        <p className="text-sm text-muted-foreground">
          Read-only management view — billing vs revenue by client, Australian financial year (July–June).
        </p>
      </div>

      <Card className="border-border/60 shadow-sm">
        <CardHeader className="space-y-1 pb-3">
          <CardTitle className="text-base font-medium">Filters</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:flex-wrap xl:items-end xl:justify-between">
            <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground">Financial year</Label>
                <Select value={String(fyStart)} onValueChange={(v) => setFyStart(Number.parseInt(v, 10))}>
                  <SelectTrigger className="h-9 w-[200px]">
                    <SelectValue placeholder="FY" />
                  </SelectTrigger>
                  <SelectContent>
                    {fyOptions.map((y) => (
                      <SelectItem key={y} value={String(y)}>
                        FY {fyLabel(y)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground">Scenario</Label>
                <div
                  role="tablist"
                  aria-label="Forecast scenario"
                  className="inline-flex h-9 rounded-lg border border-border/60 bg-muted/40 p-0.5"
                >
                  {(
                    Object.keys(SCENARIO_COPY) as FinanceForecastScenario[]
                  ).map((key) => (
                    <button
                      key={key}
                      type="button"
                      role="tab"
                      aria-selected={scenario === key}
                      className={cn(
                        "rounded-md px-3 text-sm font-medium transition-colors",
                        scenario === key
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                      onClick={() => setScenario(key)}
                    >
                      {SCENARIO_COPY[key].title}
                    </button>
                  ))}
                </div>
                <div className="flex max-w-xl flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
                  {(Object.keys(SCENARIO_COPY) as FinanceForecastScenario[]).map((key) => (
                    <Badge
                      key={`chip-${key}`}
                      variant="outline"
                      size="sm"
                      className={cn(
                        "font-normal text-muted-foreground",
                        scenario === key && "border-primary/35 bg-primary/5 text-foreground"
                      )}
                    >
                      <span className="text-foreground/90">{SCENARIO_COPY[key].title}</span>
                      <span className="mx-1 text-muted-foreground/80">·</span>
                      <span>{SCENARIO_COPY[key].chip}</span>
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="client-filter" className="text-xs font-medium text-muted-foreground">
                  Client (optional)
                </Label>
                <Input
                  id="client-filter"
                  value={clientFilter}
                  onChange={(e) => setClientFilter(e.target.value)}
                  placeholder="Name, slug, or client id"
                  className="h-9 w-full sm:w-[220px]"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="forecast-search" className="text-xs font-medium text-muted-foreground">
                  Search versions
                </Label>
                <div className="relative w-full sm:w-[240px]">
                  <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="forecast-search"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void loadForecast()
                    }}
                    placeholder="MBA, campaign, client…"
                    className="h-9 pl-9"
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                <Button onClick={() => void loadForecast()} disabled={loading} className="h-9">
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <LoadingDots />
                      Loading…
                    </span>
                  ) : (
                    "Load forecast"
                  )}
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9"
                      disabled={!canExport || exporting}
                      title={!canExport ? "Load a forecast with data to export" : undefined}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      {exporting ? "Exporting…" : "Export"}
                      <ChevronDown className="ml-1 h-4 w-4 opacity-70" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem disabled={exporting} onSelect={() => runExportCsv()}>
                      Download CSV
                    </DropdownMenuItem>
                    <DropdownMenuItem disabled={exporting} onSelect={() => runExportExcel()}>
                      Download Excel (.xlsx)
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  type="button"
                  variant="outline"
                  className="h-9"
                  disabled={snapshotBusy || loading}
                  title="Save an immutable snapshot using current FY, scenario, and filters (server-calculated)."
                  onClick={() => void takeSnapshot(false)}
                >
                  {snapshotBusy ? (
                    <span className="flex items-center gap-2">
                      <LoadingDots />
                      Snapshot…
                    </span>
                  ) : (
                    <>
                      <Camera className="mr-2 h-4 w-4" />
                      Take snapshot
                    </>
                  )}
                </Button>
              </div>
              <div className="flex max-w-lg flex-col gap-1.5">
                <Label htmlFor="snapshot-note" className="text-xs font-medium text-muted-foreground">
                  Snapshot note (optional)
                </Label>
                <Input
                  id="snapshot-note"
                  value={snapshotNote}
                  onChange={(e) => setSnapshotNote(e.target.value)}
                  placeholder="e.g. Pre–month-end review"
                  className="h-9"
                  disabled={snapshotBusy}
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 border-t border-border/40 pt-3">
            <Checkbox
              id="include-debug"
              checked={includeDebug}
              onCheckedChange={(v) => setIncludeDebug(v === true)}
            />
            <Label htmlFor="include-debug" className="cursor-pointer text-sm font-normal text-muted-foreground">
              Include row debug metadata (larger response; use row actions to inspect)
            </Label>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertTitle>{error.message}</AlertTitle>
              {error.details ? (
                <AlertDescription className="whitespace-pre-wrap font-mono text-xs">{error.details}</AlertDescription>
              ) : null}
            </Alert>
          )}

          {snapshotBanner?.kind === "success" ? (
            <Alert className="border-emerald-500/35 bg-emerald-500/[0.06] dark:bg-emerald-950/20">
              <AlertTitle>Snapshot saved</AlertTitle>
              <AlertDescription className="space-y-1 text-sm">
                <p>
                  <span className="font-medium text-foreground">Label:</span>{" "}
                  <span className="text-foreground/90">{snapshotBanner.label}</span>
                </p>
                <p>
                  <span className="font-medium text-foreground">Captured at:</span>{" "}
                  {(() => {
                    const d = new Date(snapshotBanner.taken_at)
                    return isValidDate(d)
                      ? `${format(d, "yyyy-MM-dd HH:mm:ss")} local`
                      : snapshotBanner.taken_at || "—"
                  })()}
                </p>
                <p>
                  <span className="font-medium text-foreground">Line rows:</span>{" "}
                  {snapshotBanner.line_count.toLocaleString()} (month-normalized)
                </p>
                {snapshotBanner.persisted ? (
                  <p className="text-muted-foreground">
                    Stored
                    {snapshotBanner.snapshot_id ? (
                      <>
                        {" "}
                        <span className="font-mono text-xs">({snapshotBanner.snapshot_id})</span>
                      </>
                    ) : null}
                    .
                  </p>
                ) : (
                  <p className="text-amber-800 dark:text-amber-200/90">
                    Snapshot storage is not configured on the server ({snapshotBanner.reason ?? "no base URL"}). Label
                    and counts reflect what would be saved to Xano.
                  </p>
                )}
              </AlertDescription>
            </Alert>
          ) : null}

          {snapshotBanner?.kind === "duplicate" ? (
            <Alert className="border-amber-500/40 bg-amber-500/[0.06]">
              <AlertTitle>Duplicate snapshot</AlertTitle>
              <AlertDescription className="flex flex-col gap-3 text-sm">
                <p>{snapshotBanner.message}</p>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="secondary" onClick={() => void takeSnapshot(true)}>
                    Capture as repeat
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setSnapshotBanner(null)}>
                    Dismiss
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          ) : null}

          {snapshotBanner?.kind === "error" ? (
            <Alert variant="destructive">
              <AlertTitle>Snapshot failed</AlertTitle>
              <AlertDescription className="text-sm">{snapshotBanner.message}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-sm">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
          <CardTitle className="text-base font-medium">Forecast grid</CardTitle>
          {payload?.meta ? (
            <p className="text-xs text-muted-foreground">
              FY {fyLabel(payload.meta.financial_year_start_year)} · {payload.meta.filtered_version_count} versions
              (of {payload.meta.raw_version_count}) · scope: {payload.meta.client_scope}
            </p>
          ) : null}
        </CardHeader>
        <CardContent className="p-0 sm:p-0">
          {loading ? (
            <div className="space-y-3 p-4">
              <div className="flex gap-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-48" />
              </div>
              <div className="overflow-hidden rounded-md border">
                <div className="flex gap-px bg-border p-px">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <Skeleton key={i} className="h-24 flex-1 bg-background" />
                  ))}
                </div>
              </div>
            </div>
          ) : !payload ? (
            <div className="px-4 py-16 text-center text-sm text-muted-foreground">
              Select filters and click <span className="font-medium text-foreground">Load forecast</span> to generate
              the report.
            </div>
          ) : payload.dataset.client_blocks.length === 0 ? (
            <div className="px-4 py-16 text-center text-sm text-muted-foreground">
              No data for this financial year and filters. Try another FY, scenario, or clear the client / search
              filters.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-b-lg border-t border-border/60">
              <table className="w-full min-w-[1100px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border/80 bg-muted/50">
                    <th
                      className={cn(
                        STICKY_CLIENT,
                        STICKY_HEAD,
                        "px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                      )}
                    >
                      Client
                    </th>
                    <th
                      className={cn(
                        STICKY_LINE,
                        STICKY_HEAD,
                        "px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                      )}
                    >
                      Line
                    </th>
                    {FINANCE_FORECAST_FISCAL_MONTH_ORDER.map((k) => (
                      <th
                        key={k}
                        className="whitespace-nowrap px-2 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                      >
                        {monthColumnLabel(k, payload.dataset.meta.financial_year_start_year)}
                      </th>
                    ))}
                    <th className="whitespace-nowrap px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-foreground">
                      FY total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <PortfolioSummaryRows dataset={payload.dataset} />
                  {payload.dataset.client_blocks.map((block) => (
                    <FragmentBlockMemo
                      key={block.client_id}
                      block={block}
                      colCount={colCount}
                      expanded={expandedClientIds.has(block.client_id)}
                      onToggleClient={() => toggleClientExpanded(block.client_id)}
                      onOpenDetail={handleOpenDetail}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Row metadata</SheetTitle>
            <SheetDescription>
              Source and debug fields returned by the forecast API{includeDebug ? "" : " (enable “Include row debug” and reload for full debug fields)"}.
            </SheetDescription>
          </SheetHeader>
          {detailLine ? (
            <div className="mt-4 space-y-4 text-xs">
              <div>
                <p className="mb-1 font-semibold text-foreground">Line</p>
                <p className="text-muted-foreground">
                  {FINANCE_FORECAST_LINE_LABELS[detailLine.line_key]} · {detailLine.mba_number ?? "—"} · v
                  {detailLine.version_number ?? "—"}
                </p>
              </div>
              <div>
                <p className="mb-1 font-semibold text-foreground">source</p>
                <pre className="max-h-[40vh] overflow-auto rounded-md border bg-muted/40 p-3 font-mono">
                  {JSON.stringify(detailLine.source, null, 2)}
                </pre>
              </div>
              <div>
                <p className="mb-1 font-semibold text-foreground">debug</p>
                {detailLine.debug ? (
                  <pre className="max-h-[40vh] overflow-auto rounded-md border bg-muted/40 p-3 font-mono">
                    {JSON.stringify(detailLine.debug, null, 2)}
                  </pre>
                ) : (
                  <p className="text-muted-foreground">No debug payload (toggle “Include row debug” and reload).</p>
                )}
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  )
}

function ForecastSummaryAmountCells(props: {
  monthly: FinanceForecastMonthlyAmounts
  fy: number
  cellClassName?: string
}) {
  const { monthly, fy, cellClassName } = props
  return (
    <>
      {FINANCE_FORECAST_FISCAL_MONTH_ORDER.map((k) => (
        <td
          key={k}
          className={cn(
            "whitespace-nowrap px-2 py-1.5 text-right font-mono text-xs tabular-nums text-foreground/90",
            cellClassName
          )}
        >
          {money(monthly[k] ?? 0)}
        </td>
      ))}
      <td
        className={cn(
          "whitespace-nowrap px-3 py-1.5 text-right font-mono text-xs font-medium tabular-nums text-foreground",
          cellClassName
        )}
      >
        {money(fy)}
      </td>
    </>
  )
}

function PortfolioSummaryRows({ dataset }: { dataset: FinanceForecastDataset }) {
  const blocks = dataset.client_blocks
  const billing = portfolioBillingTotals(blocks)
  const revenue = portfolioRevenueTotals(blocks)
  const grand = combineMonthlyTotals(billing, revenue)
  const headLabel =
    "px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
  const lineLabel = "px-3 py-2 text-left text-xs font-semibold text-foreground"

  return (
    <>
      <tr className="border-b border-border/70 bg-sky-500/[0.08] dark:bg-sky-950/25">
        <td rowSpan={3} className={cn(STICKY_CLIENT, STICKY_HEAD, headLabel, "align-top")}>
          Summary
        </td>
        <td className={cn(STICKY_LINE, STICKY_HEAD, lineLabel, "border-l-2 border-l-sky-500/55")}>
          Subtotal — billing
        </td>
        <ForecastSummaryAmountCells monthly={billing.monthly} fy={billing.fy} />
      </tr>
      <tr className="border-b border-border/70 bg-violet-500/[0.07] dark:bg-violet-950/20">
        <td className={cn(STICKY_LINE, STICKY_HEAD, lineLabel, "border-l-2 border-l-violet-500/55")}>
          Subtotal — revenue
        </td>
        <ForecastSummaryAmountCells monthly={revenue.monthly} fy={revenue.fy} />
      </tr>
      <tr className="border-b-2 border-border bg-muted/70 font-semibold">
        <td className={cn(STICKY_LINE, STICKY_HEAD, lineLabel)}>Grand total (billing + revenue)</td>
        <ForecastSummaryAmountCells monthly={grand.monthly} fy={grand.fy} />
      </tr>
    </>
  )
}

function ClientBillingSubtotalRow(props: {
  clientName: string
  monthly: FinanceForecastMonthlyAmounts
  fy: number
}) {
  return (
    <tr className="border-b border-border/50 bg-sky-500/[0.06] font-medium dark:bg-sky-950/20">
      <td className={cn(STICKY_CLIENT, "px-3 py-1.5 align-middle text-xs text-muted-foreground")}>
        {props.clientName}
      </td>
      <td className={cn(STICKY_LINE, "px-3 py-1.5 text-xs text-foreground")}>Subtotal — billing</td>
      <ForecastSummaryAmountCells monthly={props.monthly} fy={props.fy} />
    </tr>
  )
}

function FragmentBlock(props: {
  block: FinanceForecastDataset["client_blocks"][number]
  colCount: number
  expanded: boolean
  onToggleClient: () => void
  onOpenDetail: (line: FinanceForecastLine) => void
}) {
  const { block, colCount, expanded, onToggleClient, onOpenDetail } = props

  const billingGroup = billingGroupFromBlock(block)
  const billingAgg = useMemo(
    () =>
      billingGroup
        ? sumForecastLines(billingGroup.lines)
        : { monthly: emptyMonthlyAmounts(), fy: 0 },
    [billingGroup]
  )
  const revenueAgg = useMemo(() => sumForecastLines(clientRevenueSubtotalLines(block)), [block])

  const clientHeaderRow = (
    <tr className="border-t-2 border-border bg-muted/30">
      <td className={cn(STICKY_CLIENT, "px-2 py-2 align-top")}>
        <button
          type="button"
          aria-expanded={expanded}
          aria-label={expanded ? `Collapse ${block.client_name}` : `Expand ${block.client_name}`}
          className="flex w-full items-start gap-2 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-muted/50"
          onClick={onToggleClient}
        >
          {expanded ? (
            <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          ) : (
            <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          )}
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold tracking-tight text-foreground">{block.client_name}</span>
            <span className="mt-0.5 block font-mono text-[11px] font-normal text-muted-foreground">
              {block.client_id}
            </span>
          </span>
        </button>
      </td>
      <td className={cn(STICKY_LINE, "bg-muted/30 py-2")} />
      {FINANCE_FORECAST_FISCAL_MONTH_ORDER.map((k) => (
        <td key={k} className="border-b border-border/40 bg-muted/30 py-2" aria-hidden />
      ))}
      <td className="border-b border-border/40 bg-muted/30 py-2" aria-hidden />
    </tr>
  )

  if (!expanded) {
    return (
      <>
        <tr className="border-t-2 border-border bg-muted/30">
          <td rowSpan={2} className={cn(STICKY_CLIENT, "px-2 py-2 align-top")}>
            <button
              type="button"
              aria-expanded={false}
              aria-label={`Expand ${block.client_name}`}
              className="flex w-full items-start gap-2 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-muted/50"
              onClick={onToggleClient}
            >
              <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold tracking-tight text-foreground">{block.client_name}</span>
                <span className="mt-0.5 block font-mono text-[11px] font-normal text-muted-foreground">
                  {block.client_id}
                </span>
              </span>
            </button>
          </td>
          <td
            className={cn(
              STICKY_LINE,
              "border-l-2 border-l-sky-500/55 bg-sky-500/[0.05] px-3 py-1.5 text-xs font-semibold text-foreground dark:bg-sky-950/15"
            )}
          >
            Subtotal — billing
          </td>
          <ForecastSummaryAmountCells monthly={billingAgg.monthly} fy={billingAgg.fy} />
        </tr>
        <tr className="bg-violet-500/[0.05] dark:bg-violet-950/15">
          <td
            className={cn(
              STICKY_LINE,
              "border-l-2 border-l-violet-500/55 px-3 py-1.5 text-xs font-semibold text-foreground"
            )}
          >
            Subtotal — revenue
          </td>
          <ForecastSummaryAmountCells monthly={revenueAgg.monthly} fy={revenueAgg.fy} />
        </tr>
      </>
    )
  }

  return (
    <>
      {clientHeaderRow}
      {block.groups.map((group) => (
        <Fragment key={group.group_key}>
          <FragmentGroupMemo
            group={group}
            clientName={block.client_name}
            colCount={colCount}
            onOpenDetail={onOpenDetail}
          />
          {group.group_key === FINANCE_FORECAST_GROUP_KEYS.billingBasedInformation ? (
            <ClientBillingSubtotalRow
              clientName={block.client_name}
              monthly={billingAgg.monthly}
              fy={billingAgg.fy}
            />
          ) : null}
        </Fragment>
      ))}
    </>
  )
}

const FragmentBlockMemo = memo(FragmentBlock)

function FragmentGroup(props: {
  group: FinanceForecastDataset["client_blocks"][number]["groups"][number]
  clientName: string
  colCount: number
  onOpenDetail: (line: FinanceForecastLine) => void
}) {
  const { group, clientName, colCount, onOpenDetail } = props
  const title = group.title ?? FINANCE_FORECAST_GROUP_LABELS[group.group_key]
  const isBilling = group.group_key === FINANCE_FORECAST_GROUP_KEYS.billingBasedInformation

  return (
    <>
      <tr className={cn("bg-muted/15", isBilling ? "border-l-2 border-l-sky-500/60" : "border-l-2 border-l-violet-500/50")}>
        <td colSpan={colCount} className="px-3 py-1.5 pl-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </td>
      </tr>
      {group.lines.map((line, idx) => (
        <ForecastLineRowMemo
          key={`${line.line_key}-${line.mba_number ?? "c"}-${line.media_plan_version_id ?? idx}`}
          line={line}
          clientName={clientName}
          onOpenDetail={onOpenDetail}
        />
      ))}
    </>
  )
}

const FragmentGroupMemo = memo(FragmentGroup)

function ForecastLineRow(props: {
  line: FinanceForecastLine
  clientName: string
  onOpenDetail: (line: FinanceForecastLine) => void
}) {
  const { line, clientName, onOpenDetail } = props
  const label = FINANCE_FORECAST_LINE_LABELS[line.line_key]
  const isTotal = line.line_key === FINANCE_FORECAST_LINE_KEYS.totalRevenue

  const lineDescription = [
    label,
    line.mba_number ? `MBA ${line.mba_number}` : null,
    line.version_number != null ? `v${line.version_number}` : null,
  ]
    .filter(Boolean)
    .join(" · ")

  return (
    <tr
      className={cn(
        "border-b border-border/40 transition-colors hover:bg-muted/20",
        isTotal && "bg-emerald-950/[0.07] font-semibold dark:bg-emerald-950/25"
      )}
    >
      <td className={cn(STICKY_CLIENT, "px-3 py-1.5 align-middle text-xs text-foreground")}>{clientName}</td>
      <td className={cn(STICKY_LINE, "px-3 py-1.5 align-middle")}>
        <div className="flex items-start justify-between gap-2">
          <span className={cn("text-xs leading-snug", isTotal && "text-emerald-900 dark:text-emerald-100")}>
            {lineDescription}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={() => onOpenDetail(line)}
            title="View source / debug metadata"
          >
            <Bug className="h-3.5 w-3.5" />
            <span className="sr-only">Metadata</span>
          </Button>
        </div>
      </td>
      {FINANCE_FORECAST_FISCAL_MONTH_ORDER.map((k) => (
        <td
          key={k}
          className={cn(
            "whitespace-nowrap px-2 py-1.5 text-right font-mono text-xs tabular-nums text-foreground/90",
            isTotal && "text-emerald-900 dark:text-emerald-100"
          )}
        >
          {money(line.monthly[k] ?? 0)}
        </td>
      ))}
      <td
        className={cn(
          "whitespace-nowrap px-3 py-1.5 text-right font-mono text-xs font-medium tabular-nums",
          isTotal && "text-emerald-900 dark:text-emerald-100"
        )}
      >
        {money(line.fy_total)}
      </td>
    </tr>
  )
}

const ForecastLineRowMemo = memo(ForecastLineRow)
