"use client"

import { useCallback, useEffect, useMemo, useState, useTransition } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { ChevronDown, ChevronUp, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { EmptyState } from "@/components/finance/sections/EmptyState"
import { ErrorState } from "@/components/finance/sections/ErrorState"
import { LoadingState } from "@/components/finance/sections/LoadingState"
import { SectionScopeBar } from "@/components/finance/sections/SectionScopeBar"
import { FinanceSectionsShell } from "@/components/finance/sections/FinanceSectionsShell"
import { InvestmentMeasurePicker } from "@/components/finance/sections/investment/InvestmentMeasurePicker"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { formatMoney } from "@/lib/format/money"
import {
  INVESTMENT_CUT_DIMS,
  type InvestmentCutBasis,
  type InvestmentCutDim,
  type InvestmentCutMeasure,
  type InvestmentCutResponse,
} from "@/lib/finance/sections/investment/cutTypes"
import { dimPickerState } from "@/lib/finance/sections/investment/measureCatalog"
import { measureDef } from "@/lib/finance/sections/investment/measureCatalog"
import { fetchInvestmentCutClient } from "@/lib/finance/sections/investment/fetchInvestmentCut"
import {
  applyInvestmentUrlState,
  DEFAULT_INVESTMENT_URL_STATE,
  parseInvestmentUrlState,
} from "@/lib/finance/sections/investment/investmentUrlState"
import {
  AGENCY_ECONOMICS_CURRENT_FY_CAPTION,
  AGENCY_ECONOMICS_HISTORIC_CAPTION,
  AGENCY_ECONOMICS_PRESETS,
  AGENCY_MARGIN_RAG_THRESHOLDS,
  getAgencyEconomicsPreset,
  isAgencyEconomicsMeasure,
  measuresIncludeAgencyEconomics,
} from "@/lib/finance/sections/investment/agencyEconomics"
import { australianFyStartYearForDate } from "@/lib/finance/months"
import {
  useFinanceScopeApplied,
  useFinanceScopeStore,
  useFinanceScopeVersion,
} from "@/lib/finance/sections/useFinanceScope"
import { cn } from "@/lib/utils"

const DIM_LABELS: Record<InvestmentCutDim, string> = {
  client: "Client",
  channelGroup: "Channel group",
  channel: "Channel",
  publisher: "Publisher",
  buyType: "Buy type",
  market: "Market",
  month: "Month",
  fy: "FY",
  billingAgency: "Billing agency",
}

function formatCents(cents: number | undefined): string {
  if (cents == null || !Number.isFinite(cents)) return "—"
  return formatMoney(cents / 100)
}

function formatMeasureValue(measure: InvestmentCutMeasure, value: number | undefined): string {
  if (measure === "margin_pct") {
    if (value == null || !Number.isFinite(value)) return "—"
    // Neutral formatting — RAG thresholds not confirmed (AGENCY_MARGIN_RAG_THRESHOLDS).
    void AGENCY_MARGIN_RAG_THRESHOLDS
    return `${value}%`
  }
  return formatCents(value)
}

export function InvestmentExplorerClient() {
  const router = useRouter()
  const pathname = usePathname() ?? "/finance/investment"
  const searchParams = useSearchParams()
  const applied = useFinanceScopeApplied()
  const scopeVersion = useFinanceScopeVersion()
  const [, startTransition] = useTransition()

  const urlState = useMemo(
    () => parseInvestmentUrlState(new URLSearchParams(searchParams?.toString() ?? "")),
    [searchParams]
  )

  const [dimensions, setDimensions] = useState<InvestmentCutDim[]>(urlState.dimensions)
  const [measures, setMeasures] = useState<InvestmentCutMeasure[]>(urlState.measures)
  const [basis, setBasis] = useState<InvestmentCutBasis>(urlState.basis)
  const [presetId, setPresetId] = useState<string | null>(urlState.presetId)
  const [searchInput, setSearchInput] = useState(urlState.search)
  const [search, setSearch] = useState(urlState.search)
  const [data, setData] = useState<InvestmentCutResponse | null>(null)
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "grain-error">(
    "loading"
  )
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [blockedCode, setBlockedCode] = useState<string | null>(null)

  const currentFy = australianFyStartYearForDate(new Date())
  const historicAgencyBlocked =
    applied.fy < currentFy &&
    (measuresIncludeAgencyEconomics(measures) ||
      Boolean(presetId && getAgencyEconomicsPreset(presetId)))

  // Debounce search → server
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300)
    return () => clearTimeout(t)
  }, [searchInput])

  // Sync local ← URL on external navigation
  useEffect(() => {
    setDimensions(urlState.dimensions)
    setMeasures(urlState.measures)
    setBasis(urlState.basis)
    setPresetId(urlState.presetId)
    setSearchInput(urlState.search)
    setSearch(urlState.search)
  }, [urlState])

  const pushUrl = useCallback(
    (next: {
      dimensions?: InvestmentCutDim[]
      measures?: InvestmentCutMeasure[]
      basis?: InvestmentCutBasis
      search?: string
      presetId?: string | null
    }) => {
      const state = {
        dimensions: next.dimensions ?? dimensions,
        measures: next.measures ?? measures,
        basis: next.basis ?? basis,
        search: next.search ?? search,
        presetId: next.presetId !== undefined ? next.presetId : presetId,
      }
      const scopeParams = useFinanceScopeStore.getState().toSearchParams()
      const merged = applyInvestmentUrlState(scopeParams, state)
      startTransition(() => {
        router.replace(`${pathname}?${merged.toString()}`, { scroll: false })
      })
    },
    [basis, dimensions, measures, pathname, presetId, router, search]
  )

  const load = useCallback(() => {
    if (historicAgencyBlocked) {
      setStatus("grain-error")
      setBlockedCode("AGENCY_ECONOMICS_HISTORIC_FY_BLOCKED")
      setErrorMessage(AGENCY_ECONOMICS_HISTORIC_CAPTION)
      setData(null)
      return
    }
    setStatus("loading")
    setErrorMessage(null)
    setBlockedCode(null)
    void fetchInvestmentCutClient(
      {
        fy: applied.fy,
        monthRange: { from: applied.monthRange.from, to: applied.monthRange.to },
        basis,
        dimensions,
        measures,
        filters: {
          clients: applied.clients,
          search: search || undefined,
        },
        presetId,
      },
      { retry: () => load() }
    ).then((vs) => {
      if (vs.status === "grain-error") {
        setStatus("grain-error")
        setBlockedCode(vs.error.error)
        setErrorMessage(vs.error.message)
        setData(null)
        return
      }
      if (vs.status === "error") {
        setStatus("error")
        setErrorMessage(vs.message)
        setData(null)
        return
      }
      if (vs.status === "ready") {
        setStatus("ready")
        setData(vs.data)
        return
      }
      setStatus("loading")
    })
  }, [
    applied.clients,
    applied.fy,
    applied.monthRange.from,
    applied.monthRange.to,
    basis,
    dimensions,
    historicAgencyBlocked,
    measures,
    presetId,
    search,
  ])

  useEffect(() => {
    load()
  }, [load, scopeVersion])

  useEffect(() => {
    pushUrl({ search })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- URL sync on debounced search only
  }, [search])

  function toggleDim(dim: InvestmentCutDim) {
    const gate = dimPickerState(dim, measures)
    if (gate.disabled) return
    let next: InvestmentCutDim[]
    if (dimensions.includes(dim)) {
      next = dimensions.filter((d) => d !== dim)
    } else {
      next = [...dimensions, dim]
    }
    setDimensions(next)
    setPresetId(null)
    pushUrl({ dimensions: next, presetId: null })
  }

  function moveDim(index: number, dir: -1 | 1) {
    const j = index + dir
    if (j < 0 || j >= dimensions.length) return
    const next = [...dimensions]
    const tmp = next[index]!
    next[index] = next[j]!
    next[j] = tmp
    setDimensions(next)
    setPresetId(null)
    pushUrl({ dimensions: next, presetId: null })
  }

  function onMeasuresChange(next: InvestmentCutMeasure[]) {
    setMeasures(next)
    setPresetId(null)
    pushUrl({ measures: next, presetId: null })
  }

  function onBasisChange(next: InvestmentCutBasis) {
    setBasis(next)
    setPresetId(null)
    pushUrl({ basis: next, presetId: null })
  }

  function applyPreset(id: string) {
    const preset = getAgencyEconomicsPreset(id)
    if (!preset) return
    if (applied.fy < currentFy) {
      useFinanceScopeStore.getState().setDraftFy(currentFy)
      useFinanceScopeStore.getState().apply()
    }
    setDimensions(preset.cut.dimensions)
    setMeasures(preset.cut.measures)
    setBasis(preset.basis)
    setPresetId(preset.id)
    setSearchInput("")
    setSearch("")
    pushUrl({
      dimensions: preset.cut.dimensions,
      measures: preset.cut.measures,
      basis: preset.basis,
      search: "",
      presetId: preset.id,
    })
  }

  const honesty = useMemo(() => {
    if (!data) return null
    const parts = [
      `${data.coverage.rowCount} row${data.coverage.rowCount === 1 ? "" : "s"}`,
      data.truncated ? `truncated at ${data.rowCap}` : null,
      `publisher match ${data.coverage.publisherMatchedPct}%`,
    ]
    if (data.coverage.ar) {
      parts.push(`AR matched ${data.coverage.ar.matchedPct}%`)
    }
    if (data.coverage.fee) {
      parts.push(`fee months ${data.coverage.fee.coveragePct}%`)
    }
    return parts.filter(Boolean).join(" · ")
  }, [data])

  const showAgencyCaption =
    measuresIncludeAgencyEconomics(measures) ||
    Boolean(presetId && getAgencyEconomicsPreset(presetId)) ||
    Boolean(data?.coverage.agency)

  const grainErrorTitle =
    blockedCode === "AGENCY_ECONOMICS_HISTORIC_FY_BLOCKED"
      ? "Agency economics — current FY only"
      : blockedCode === "AGENCY_REVENUE_GRAIN_UNSUPPORTED"
        ? "Agency revenue grain unsupported"
        : "Actuals grain unsupported"

  return (
    <FinanceSectionsShell title="Investment" scopeBar={<SectionScopeBar />}>
      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="space-y-4 rounded-card border border-border bg-card p-4 shadow-e1">
          <div>
            <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Presets
            </div>
            <div className="flex flex-col gap-1.5">
              {AGENCY_ECONOMICS_PRESETS.map((p) => (
                <Button
                  key={p.id}
                  type="button"
                  size="sm"
                  variant={presetId === p.id ? "default" : "outline"}
                  className="h-auto justify-start whitespace-normal py-1.5 text-left text-xs"
                  onClick={() => applyPreset(p.id)}
                  title={p.description}
                >
                  {p.name}
                </Button>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Seeded agency-economics views · current FY only
            </p>
          </div>

          <div>
            <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Dimensions
            </div>
            <TooltipProvider delayDuration={200}>
              <div className="mb-2 flex flex-wrap gap-1.5">
                {dimensions.map((dim, i) => (
                  <span
                    key={dim}
                    className="inline-flex items-center gap-0.5 rounded-pill border border-primary bg-primary/10 px-1.5 py-0.5 text-xs"
                  >
                    <span className="num px-0.5 text-muted-foreground">{i + 1}</span>
                    {DIM_LABELS[dim]}
                    <button
                      type="button"
                      className="rounded p-0.5 hover:bg-table-row-hover"
                      onClick={() => moveDim(i, -1)}
                      aria-label="Move up"
                    >
                      <ChevronUp className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      className="rounded p-0.5 hover:bg-table-row-hover"
                      onClick={() => moveDim(i, 1)}
                      aria-label="Move down"
                    >
                      <ChevronDown className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      className="rounded p-0.5 hover:bg-table-row-hover"
                      onClick={() => toggleDim(dim)}
                      aria-label="Remove"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {INVESTMENT_CUT_DIMS.filter((d) => !dimensions.includes(d)).map((dim) => {
                  const gate = dimPickerState(dim, measures)
                  const chip = (
                    <button
                      type="button"
                      key={dim}
                      disabled={gate.disabled}
                      onClick={() => toggleDim(dim)}
                      className={cn(
                        "rounded-pill border border-border px-2 py-0.5 text-xs",
                        gate.disabled
                          ? "cursor-not-allowed opacity-50"
                          : "interactive-tint cursor-pointer"
                      )}
                    >
                      <Badge variant="outline" className="border-0 bg-transparent p-0 font-normal">
                        {DIM_LABELS[dim]}
                      </Badge>
                    </button>
                  )
                  if (gate.disabled && gate.disabledReason) {
                    return (
                      <Tooltip key={dim}>
                        <TooltipTrigger asChild>{chip}</TooltipTrigger>
                        <TooltipContent className="max-w-xs text-xs">
                          {gate.disabledReason}
                        </TooltipContent>
                      </Tooltip>
                    )
                  }
                  return chip
                })}
              </div>
            </TooltipProvider>
          </div>

          <div>
            <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Measures
            </div>
            <InvestmentMeasurePicker
              dimensions={dimensions}
              measures={measures}
              onChange={onMeasuresChange}
              fy={applied.fy}
            />
          </div>

          <div>
            <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Basis
            </div>
            <div className="flex gap-1.5">
              {(["billing", "delivery"] as const).map((b) => (
                <Button
                  key={b}
                  type="button"
                  size="sm"
                  variant={basis === b ? "default" : "outline"}
                  onClick={() => onBasisChange(b)}
                >
                  {b === "billing" ? "Billing" : "Delivery"}
                </Button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Search
            </div>
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Client, campaign, MBA, line, publisher…"
              className="h-9"
            />
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={() => {
              setDimensions(DEFAULT_INVESTMENT_URL_STATE.dimensions)
              setMeasures(DEFAULT_INVESTMENT_URL_STATE.measures)
              setBasis(DEFAULT_INVESTMENT_URL_STATE.basis)
              setPresetId(null)
              setSearchInput("")
              setSearch("")
              pushUrl({ ...DEFAULT_INVESTMENT_URL_STATE, presetId: null })
            }}
          >
            Reset to default cut
          </Button>
        </aside>

        <main className="min-w-0 space-y-3">
          {showAgencyCaption ? (
            <div className="rounded-input border border-border bg-surface-panel px-3 py-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Current FY only</span>
              {" · "}
              {data?.coverage.agency?.caption ?? AGENCY_ECONOMICS_CURRENT_FY_CAPTION}
            </div>
          ) : null}

          {honesty ? (
            <div className="rounded-input border border-border bg-surface-panel px-3 py-2 text-xs text-muted-foreground">
              {honesty}
              {data?.coverage.ar ? (
                <span className="mt-1 block text-[11px]">{data.coverage.ar.note}</span>
              ) : null}
              {data?.coverage.fee &&
              measures.some(
                (m) =>
                  m === "fee_cents" ||
                  m === "billable_cents" ||
                  m === "revenue_cents" ||
                  m === "margin_pct" ||
                  isAgencyEconomicsMeasure(m)
              ) ? (
                <span className="mt-1 block text-[11px] text-status-critical-fg">
                  {data.coverage.fee.caveat}
                </span>
              ) : null}
            </div>
          ) : null}

          {status === "loading" ? <LoadingState /> : null}
          {status === "error" ? (
            <ErrorState message={errorMessage ?? "Failed to load"} onRetry={load} />
          ) : null}
          {status === "grain-error" ? (
            <ErrorState
              title={grainErrorTitle}
              message={errorMessage ?? "Cut not available for this configuration"}
              retryLabel={
                blockedCode === "AGENCY_ECONOMICS_HISTORIC_FY_BLOCKED"
                  ? `Switch to FY${currentFy}`
                  : blockedCode?.startsWith("AGENCY_")
                    ? "Clear agency measures"
                    : "Drop Actuals measures"
              }
              onRetry={() => {
                if (blockedCode === "AGENCY_ECONOMICS_HISTORIC_FY_BLOCKED") {
                  useFinanceScopeStore.getState().setDraftFy(currentFy)
                  useFinanceScopeStore.getState().apply()
                  return
                }
                if (blockedCode?.startsWith("AGENCY_")) {
                  const next = measures.filter((m) => !isAgencyEconomicsMeasure(m))
                  const booked = next.length ? next : [...DEFAULT_INVESTMENT_URL_STATE.measures]
                  setMeasures(booked)
                  setPresetId(null)
                  pushUrl({ measures: booked, presetId: null })
                  return
                }
                const booked = measures.filter(
                  (m) =>
                    m === "media_cents" ||
                    m === "fee_cents" ||
                    m === "adserving_cents" ||
                    m === "billable_cents" ||
                    isAgencyEconomicsMeasure(m)
                )
                const next = booked.length ? booked : [...DEFAULT_INVESTMENT_URL_STATE.measures]
                setMeasures(next)
                pushUrl({ measures: next })
              }}
            />
          ) : null}

          {status === "ready" && data && data.rows.length === 0 ? (
            <EmptyState title="No rows" message="Try widening scope or clearing search." />
          ) : null}

          {status === "ready" && data && data.rows.length > 0 ? (
            <div className="overflow-x-auto rounded-card border border-border bg-card shadow-e1">
              <Table>
                <TableHeader>
                  <TableRow>
                    {dimensions.map((d) => (
                      <TableHead key={d}>{DIM_LABELS[d]}</TableHead>
                    ))}
                    {measures.map((m) => (
                      <TableHead key={m} className="text-right">
                        {measureDef(m).label}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.rows.map((row, i) => (
                    <TableRow key={i} className="interactive-row">
                      {dimensions.map((d) => (
                        <TableCell key={d}>{row.dims[d] ?? "—"}</TableCell>
                      ))}
                      {measures.map((m) => (
                        <TableCell key={m} className="num text-right">
                          {formatMeasureValue(m, row.measures[m])}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    {dimensions.length === 0 ? (
                      <TableCell className="font-medium">Totals</TableCell>
                    ) : (
                      <TableCell colSpan={dimensions.length} className="font-medium">
                        Totals
                      </TableCell>
                    )}
                    {measures.map((m) => (
                      <TableCell key={m} className="num text-right font-medium">
                        {formatMeasureValue(m, data.totals[m])}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          ) : null}
        </main>
      </div>
    </FinanceSectionsShell>
  )
}
