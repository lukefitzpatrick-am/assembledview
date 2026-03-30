"use client"

import { Fragment, useCallback, useEffect, useMemo, useState } from "react"
import { format } from "date-fns"
import { ChevronRight, GitCompareArrows, Loader2 } from "lucide-react"

import type { FinanceForecastVarianceSnapshotHeaderSummary } from "@/app/api/finance/forecast/snapshots/variance/route"
import {
  FINANCE_FORECAST_FISCAL_MONTH_ORDER,
  FINANCE_FORECAST_GROUP_LABELS,
  FINANCE_FORECAST_LINE_LABELS,
  type FinanceForecastMonthKey,
} from "@/lib/types/financeForecast"
import type { FinanceForecastSnapshotRecord } from "@/lib/types/financeForecastSnapshot"
import type {
  FinanceForecastVarianceAttribution,
  FinanceForecastVarianceChangeType,
  FinanceForecastVarianceMonthLineRow,
  FinanceForecastVarianceReport,
} from "@/lib/types/financeForecastVariance"
import { formatMoney } from "@/lib/utils/money"
import { cn } from "@/lib/utils"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

const moneyFmt = (n: number | null) =>
  n === null || Number.isNaN(n)
    ? "—"
    : formatMoney(n, {
        locale: "en-AU",
        currency: "AUD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })

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

function defaultFyStartYear(): number {
  const d = new Date()
  const y = d.getFullYear()
  return d.getMonth() >= 6 ? y : y - 1
}

function deltaToneClass(delta: number): string {
  if (delta > 0) return "text-emerald-600 dark:text-emerald-400"
  if (delta < 0) return "text-rose-600 dark:text-rose-400"
  return "text-muted-foreground"
}

function attributionConfidenceBadge(confidence: FinanceForecastVarianceAttribution["confidence"]) {
  if (confidence === "high") {
    return (
      <Badge variant="secondary" size="sm" className="shrink-0 font-normal">
        High confidence
      </Badge>
    )
  }
  if (confidence === "medium") {
    return (
      <Badge variant="outline" size="sm" className="shrink-0 font-normal">
        Medium confidence
      </Badge>
    )
  }
  return (
    <Badge variant="outline" size="sm" className="shrink-0 font-normal text-muted-foreground">
      Uncertain
    </Badge>
  )
}

function changeTypeBadge(type: FinanceForecastVarianceChangeType) {
  const variant: "info" | "danger" | "success" | "secondary" | "warning" =
    type === "new"
      ? "info"
      : type === "removed"
        ? "danger"
        : type === "increased"
          ? "success"
          : type === "decreased"
            ? "danger"
            : "secondary"
  return (
    <Badge variant={variant} size="sm" className="font-normal capitalize">
      {type.replace("_", " ")}
    </Badge>
  )
}

function rowKey(r: FinanceForecastVarianceMonthLineRow): string {
  return [r.client_id, r.media_plan_version_id ?? "", r.group_key, r.line_key, r.month_key].join("\u001f")
}

const CHANGE_TYPES: FinanceForecastVarianceChangeType[] = [
  "new",
  "removed",
  "increased",
  "decreased",
  "unchanged",
]

export default function FinanceForecastVariancePageClient() {
  const [snapshots, setSnapshots] = useState<FinanceForecastSnapshotRecord[]>([])
  const [listConfigured, setListConfigured] = useState<boolean | null>(null)
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)

  const [olderId, setOlderId] = useState<string>("")
  const [newerId, setNewerId] = useState<string>("")
  const [includeUnchanged, setIncludeUnchanged] = useState(false)

  const [report, setReport] = useState<FinanceForecastVarianceReport | null>(null)
  const [olderH, setOlderH] = useState<FinanceForecastVarianceSnapshotHeaderSummary | null>(null)
  const [newerH, setNewerH] = useState<FinanceForecastVarianceSnapshotHeaderSummary | null>(null)
  const [varianceLoading, setVarianceLoading] = useState(false)
  const [varianceError, setVarianceError] = useState<string | null>(null)

  const [filterClientId, setFilterClientId] = useState<string>("__all__")
  const [filterLineCategory, setFilterLineCategory] = useState<string>("__all__")
  const [changeTypeFilters, setChangeTypeFilters] = useState<Record<FinanceForecastVarianceChangeType, boolean>>({
    new: true,
    removed: true,
    increased: true,
    decreased: true,
    unchanged: false,
  })

  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

  const toggleExpanded = useCallback((key: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const loadSnapshots = useCallback(async () => {
    setListLoading(true)
    setListError(null)
    try {
      const res = await fetch("/api/finance/forecast/snapshots", { cache: "no-store" })
      const data = (await res.json()) as
        | { snapshots?: FinanceForecastSnapshotRecord[]; configured?: boolean; error?: string; message?: string }
        | Record<string, unknown>
      if (!res.ok) {
        throw new Error(
          typeof (data as { message?: string }).message === "string"
            ? (data as { message?: string }).message
            : "Could not load snapshots."
        )
      }
      const raw = Array.isArray((data as { snapshots?: unknown }).snapshots)
        ? (data as { snapshots: FinanceForecastSnapshotRecord[] }).snapshots
        : []
      const sorted = [...raw].sort(
        (a, b) => new Date(b.taken_at).getTime() - new Date(a.taken_at).getTime()
      )
      setSnapshots(sorted)
      setListConfigured(Boolean((data as { configured?: boolean }).configured))
    } catch (e) {
      setListError(e instanceof Error ? e.message : String(e))
      setSnapshots([])
    } finally {
      setListLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSnapshots()
  }, [loadSnapshots])

  const runVariance = useCallback(async () => {
    if (!olderId || !newerId || olderId === newerId) return
    setVarianceError(null)
    setVarianceLoading(true)
    setReport(null)
    setOlderH(null)
    setNewerH(null)
    try {
      const res = await fetch("/api/finance/forecast/snapshots/variance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          older_snapshot_id: olderId,
          newer_snapshot_id: newerId,
          include_unchanged: includeUnchanged,
        }),
      })
      const data = (await res.json()) as Record<string, unknown>
      if (!res.ok) {
        throw new Error(
          typeof data.message === "string" ? data.message : typeof data.error === "string" ? data.error : "Variance failed."
        )
      }
      if (data.ok === true && data.report && data.older && data.newer) {
        setReport(data.report as FinanceForecastVarianceReport)
        setOlderH(data.older as FinanceForecastVarianceSnapshotHeaderSummary)
        setNewerH(data.newer as FinanceForecastVarianceSnapshotHeaderSummary)
      }
    } catch (e) {
      setVarianceError(e instanceof Error ? e.message : String(e))
    } finally {
      setVarianceLoading(false)
    }
  }, [includeUnchanged, newerId, olderId])

  const fyYear =
    olderH?.financial_year ?? newerH?.financial_year ?? defaultFyStartYear()

  const filteredRows = useMemo(() => {
    if (!report) return []
    const wantTypes = new Set(CHANGE_TYPES.filter((t) => changeTypeFilters[t]))
    return report.by_month_line.filter((r) => {
      if (!wantTypes.has(r.change_type)) return false
      if (filterClientId !== "__all__" && r.client_id !== filterClientId) return false
      if (filterLineCategory !== "__all__") {
        const k = `${r.group_key}\u001f${r.line_key}`
        if (k !== filterLineCategory) return false
      }
      return true
    })
  }, [report, filterClientId, filterLineCategory, changeTypeFilters])

  const groupedByClient = useMemo(() => {
    const m = new Map<string, FinanceForecastVarianceMonthLineRow[]>()
    for (const r of filteredRows) {
      const arr = m.get(r.client_id) ?? []
      arr.push(r)
      m.set(r.client_id, arr)
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => {
        const g = a.group_key.localeCompare(b.group_key)
        if (g !== 0) return g
        const l = a.line_key.localeCompare(b.line_key)
        if (l !== 0) return l
        return (
          FINANCE_FORECAST_FISCAL_MONTH_ORDER.indexOf(a.month_key) -
          FINANCE_FORECAST_FISCAL_MONTH_ORDER.indexOf(b.month_key)
        )
      })
    }
    return [...m.entries()].sort((a, b) => (a[1][0]?.client_name ?? "").localeCompare(b[1][0]?.client_name ?? ""))
  }, [filteredRows])

  const clientOptions = useMemo(() => {
    if (!report) return []
    const m = new Map<string, string>()
    for (const r of report.by_month_line) {
      m.set(r.client_id, r.client_name)
    }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [report])

  const lineCategoryOptions = useMemo(() => {
    if (!report) return []
    const s = new Set<string>()
    for (const r of report.by_month_line) {
      s.add(`${r.group_key}\u001f${r.line_key}`)
    }
    return [...s]
      .sort()
      .map((k) => {
        const sep = k.indexOf("\u001f")
        const gk = k.slice(0, sep) as keyof typeof FINANCE_FORECAST_GROUP_LABELS
        const lk = k.slice(sep + 1) as keyof typeof FINANCE_FORECAST_LINE_LABELS
        return {
          value: k,
          label: `${FINANCE_FORECAST_GROUP_LABELS[gk]} — ${FINANCE_FORECAST_LINE_LABELS[lk]}`,
        }
      })
  }, [report])

  const clientsImpacted = useMemo(() => {
    if (!report) return 0
    return report.by_client.filter((c) => c.change_type !== "unchanged").length
  }, [report])

  const bothConfirmed =
    olderH?.scenario === "confirmed" && newerH?.scenario === "confirmed"
  const bothProbableScope =
    olderH?.scenario === "confirmed_plus_probable" && newerH?.scenario === "confirmed_plus_probable"

  const confirmedDelta = bothConfirmed ? report?.fy_total.absolute_change ?? null : null
  const probableDelta = bothProbableScope ? report?.fy_total.absolute_change ?? null : null

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Forecast snapshot variance</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Compare two saved forecasts (read-only). Older snapshot amounts are treated as the baseline; newer as the
          current view.
        </p>
      </div>

      {listError ? (
        <Alert variant="destructive">
          <AlertTitle>Could not load snapshots</AlertTitle>
          <AlertDescription>{listError}</AlertDescription>
        </Alert>
      ) : null}

      {listConfigured === false ? (
        <Alert>
          <AlertTitle>Snapshot storage not configured</AlertTitle>
          <AlertDescription>
            Set <span className="font-mono text-xs">XANO_FINANCE_FORECAST_SNAPSHOTS_BASE_URL</span> to list and compare
            snapshots from Xano.
          </AlertDescription>
        </Alert>
      ) : null}

      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Compare snapshots</CardTitle>
          <CardDescription>Select an older (baseline) and newer snapshot, then run the variance.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-end">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Older snapshot (baseline)</Label>
              <Select value={olderId || undefined} onValueChange={setOlderId} disabled={listLoading}>
                <SelectTrigger className="h-9 w-full min-w-[260px] lg:w-[280px]">
                  <SelectValue placeholder={listLoading ? "Loading…" : "Choose snapshot"} />
                </SelectTrigger>
                <SelectContent>
                  {snapshots.map((s) => (
                    <SelectItem key={String(s.id)} value={String(s.id)}>
                      {s.snapshot_label} · FY{s.financial_year} · {s.scenario === "confirmed" ? "Confirmed" : "C+P"} ·{" "}
                      {format(new Date(s.taken_at), "dd MMM yyyy HH:mm")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Newer snapshot</Label>
              <Select value={newerId || undefined} onValueChange={setNewerId} disabled={listLoading}>
                <SelectTrigger className="h-9 w-full min-w-[260px] lg:w-[280px]">
                  <SelectValue placeholder={listLoading ? "Loading…" : "Choose snapshot"} />
                </SelectTrigger>
                <SelectContent>
                  {snapshots.map((s) => (
                    <SelectItem key={`n-${String(s.id)}`} value={String(s.id)}>
                      {s.snapshot_label} · FY{s.financial_year} · {s.scenario === "confirmed" ? "Confirmed" : "C+P"} ·{" "}
                      {format(new Date(s.taken_at), "dd MMM yyyy HH:mm")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Checkbox
                id="inc-un"
                checked={includeUnchanged}
                onCheckedChange={(v) => setIncludeUnchanged(v === true)}
              />
              <Label htmlFor="inc-un" className="cursor-pointer text-sm font-normal text-muted-foreground">
                Include unchanged rows (slower)
              </Label>
            </div>
            <Button
              type="button"
              className="h-9"
              disabled={!olderId || !newerId || olderId === newerId || varianceLoading || listLoading}
              onClick={() => void runVariance()}
            >
              {varianceLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Comparing…
                </>
              ) : (
                <>
                  <GitCompareArrows className="mr-2 h-4 w-4" />
                  Compare
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {varianceError ? (
        <Alert variant="destructive">
          <AlertTitle>Variance failed</AlertTitle>
          <AlertDescription>{varianceError}</AlertDescription>
        </Alert>
      ) : null}

      {report && olderH && newerH ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Card className="border-border/60 shadow-sm" title="Net movement across the full newer snapshot total vs older.">
              <CardHeader className="pb-1 pt-4">
                <CardDescription>Total forecast change</CardDescription>
                <CardTitle className={cn("font-mono text-xl tabular-nums", deltaToneClass(report.fy_total.absolute_change))}>
                  {moneyFmt(report.fy_total.absolute_change)}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card
              className="border-border/60 shadow-sm"
              title={
                bothConfirmed
                  ? "Both snapshots use the Confirmed scenario (booked / approved / completed)."
                  : "Shown only when both snapshots were taken under the Confirmed scenario."
              }
            >
              <CardHeader className="pb-1 pt-4">
                <CardDescription>Confirmed scenario change</CardDescription>
                <CardTitle
                  className={cn(
                    "font-mono text-xl tabular-nums",
                    confirmedDelta === null ? "text-muted-foreground" : deltaToneClass(confirmedDelta)
                  )}
                >
                  {confirmedDelta === null ? "—" : moneyFmt(confirmedDelta)}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card
              className="border-border/60 shadow-sm"
              title={
                bothProbableScope
                  ? "Both snapshots include Confirmed + Probable (non-cancelled) scope."
                  : "Shown only when both snapshots use Confirmed + Probable."
              }
            >
              <CardHeader className="pb-1 pt-4">
                <CardDescription>Confirmed + probable change</CardDescription>
                <CardTitle
                  className={cn(
                    "font-mono text-xl tabular-nums",
                    probableDelta === null ? "text-muted-foreground" : deltaToneClass(probableDelta)
                  )}
                >
                  {probableDelta === null ? "—" : moneyFmt(probableDelta)}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card className="border-border/60 shadow-sm">
              <CardHeader className="pb-1 pt-4">
                <CardDescription>Clients with movement</CardDescription>
                <CardTitle className="font-mono text-xl tabular-nums text-foreground">{clientsImpacted}</CardTitle>
              </CardHeader>
            </Card>
          </div>

          <Card className="border-border/60 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Filters</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-end">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Client</Label>
                  <Select value={filterClientId} onValueChange={setFilterClientId}>
                    <SelectTrigger className="h-9 w-full min-w-[200px] lg:w-[220px]">
                      <SelectValue placeholder="All clients" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All clients</SelectItem>
                      {clientOptions.map(([id, name]) => (
                        <SelectItem key={id} value={id}>
                          {name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Line category</Label>
                  <Select value={filterLineCategory} onValueChange={setFilterLineCategory}>
                    <SelectTrigger className="h-9 w-full min-w-[240px] lg:w-[320px]">
                      <SelectValue placeholder="All categories" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All line categories</SelectItem>
                      {lineCategoryOptions.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Change type</Label>
                <div className="flex flex-wrap gap-4">
                  {CHANGE_TYPES.map((t) => (
                    <div key={t} className="flex items-center gap-2">
                      <Checkbox
                        id={`ct-${t}`}
                        checked={changeTypeFilters[t]}
                        onCheckedChange={(v) =>
                          setChangeTypeFilters((prev) => ({ ...prev, [t]: v === true }))
                        }
                      />
                      <Label htmlFor={`ct-${t}`} className="cursor-pointer text-sm font-normal capitalize">
                        {t.replace("_", " ")}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/60 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Variance by client</CardTitle>
              <CardDescription>
                {olderH.snapshot_label} → {newerH.snapshot_label} · FY starting {fyYear}
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0 sm:px-6 sm:pb-6">
              {groupedByClient.length === 0 ? (
                <p className="px-6 py-10 text-center text-sm text-muted-foreground">
                  No rows match the current filters.
                </p>
              ) : (
                <div className="space-y-8">
                  {groupedByClient.map(([clientId, rows]) => (
                    <div key={clientId} className="space-y-2">
                      <h3 className="sticky left-0 px-3 text-sm font-semibold text-foreground">
                        {rows[0]?.client_name ?? clientId}
                        <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">{clientId}</span>
                      </h3>
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="w-8" />
                            <TableHead className="min-w-[200px]">Line item</TableHead>
                            <TableHead>Month</TableHead>
                            <TableHead className="text-right">Older</TableHead>
                            <TableHead className="text-right">Newer</TableHead>
                            <TableHead className="text-right">Variance</TableHead>
                            <TableHead className="text-right">% </TableHead>
                            <TableHead>Change</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {rows.map((r) => {
                            const k = rowKey(r)
                            const open = expandedRows.has(k)
                            return (
                              <Fragment key={k}>
                                <TableRow className="border-border/60">
                                  <TableCell className="p-1 align-middle">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      aria-expanded={open}
                                      onClick={() => toggleExpanded(k)}
                                      title="Source / debug metadata"
                                    >
                                      <ChevronRight
                                        className={cn("h-4 w-4 transition-transform", open && "rotate-90")}
                                      />
                                    </Button>
                                  </TableCell>
                                  <TableCell className="align-top text-sm">
                                    <div className="font-medium text-foreground">
                                      {FINANCE_FORECAST_LINE_LABELS[r.line_key]}
                                    </div>
                                    <div className="text-[11px] text-muted-foreground">
                                      {FINANCE_FORECAST_GROUP_LABELS[r.group_key]}
                                      {r.mba_number ? ` · MBA ${r.mba_number}` : ""}
                                      {r.version_number != null ? ` · v${r.version_number}` : ""}
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-sm text-muted-foreground">
                                    {monthColumnLabel(r.month_key, fyYear)}
                                  </TableCell>
                                  <TableCell className="text-right font-mono text-sm tabular-nums">
                                    {moneyFmt(r.old_amount)}
                                  </TableCell>
                                  <TableCell className="text-right font-mono text-sm tabular-nums">
                                    {moneyFmt(r.new_amount)}
                                  </TableCell>
                                  <TableCell
                                    className={cn(
                                      "text-right font-mono text-sm font-medium tabular-nums",
                                      deltaToneClass(r.absolute_change)
                                    )}
                                  >
                                    {moneyFmt(r.absolute_change)}
                                  </TableCell>
                                  <TableCell className="text-right font-mono text-xs text-muted-foreground tabular-nums">
                                    {r.percent_change === null ? "—" : `${r.percent_change.toFixed(1)}%`}
                                  </TableCell>
                                  <TableCell>{changeTypeBadge(r.change_type)}</TableCell>
                                </TableRow>
                                {open ? (
                                  <TableRow className="border-border/40 bg-muted/20 hover:bg-muted/20">
                                    <TableCell colSpan={8} className="p-4 align-top">
                                      {r.attribution ? (
                                        <div
                                          className={cn(
                                            "mb-4 rounded-md border p-3",
                                            r.attribution.confidence === "low"
                                              ? "border-border/60 bg-muted/30"
                                              : "border-border bg-background"
                                          )}
                                        >
                                          <div className="mb-2 flex flex-wrap items-center gap-2">
                                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                              Forecast change — likely driver
                                            </p>
                                            {attributionConfidenceBadge(r.attribution.confidence)}
                                          </div>
                                          <p
                                            className={cn(
                                              "text-sm leading-snug",
                                              r.attribution.confidence === "low"
                                                ? "text-muted-foreground"
                                                : "text-foreground"
                                            )}
                                          >
                                            {r.attribution.explanation}
                                          </p>
                                          {r.attribution.drivers.length > 0 && r.attribution.confidence !== "low" ? (
                                            <p className="mt-2 text-[11px] text-muted-foreground">
                                              Signals: {r.attribution.drivers.join(", ").replace(/_/g, " ")}
                                            </p>
                                          ) : null}
                                        </div>
                                      ) : null}
                                      <div className="grid gap-4 md:grid-cols-2">
                                        <div>
                                          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                            Older snapshot — source
                                          </p>
                                          <pre className="max-h-48 overflow-auto rounded-md border bg-background p-3 text-[11px] leading-relaxed">
                                            {r.baseline
                                              ? JSON.stringify(
                                                  {
                                                    line_record_id: r.baseline.line_record_id,
                                                    source_hash: r.baseline.source_hash,
                                                    source_debug_json: tryParseJson(r.baseline.source_debug_json),
                                                  },
                                                  null,
                                                  2
                                                )
                                              : "(no row in older snapshot)"}
                                          </pre>
                                        </div>
                                        <div>
                                          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                            Newer snapshot — source
                                          </p>
                                          <pre className="max-h-48 overflow-auto rounded-md border bg-background p-3 text-[11px] leading-relaxed">
                                            {r.comparison
                                              ? JSON.stringify(
                                                  {
                                                    line_record_id: r.comparison.line_record_id,
                                                    source_hash: r.comparison.source_hash,
                                                    source_debug_json: tryParseJson(r.comparison.source_debug_json),
                                                  },
                                                  null,
                                                  2
                                                )
                                              : "(no row in newer snapshot)"}
                                          </pre>
                                        </div>
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                ) : null}
                              </Fragment>
                            )
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  )
}

function tryParseJson(raw: string | null | undefined): unknown {
  if (raw == null || raw === "") return null
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return raw
  }
}
