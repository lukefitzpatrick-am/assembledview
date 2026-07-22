"use client"

import { useEffect, useRef, useState } from "react"
import { format } from "date-fns"
import { Save } from "lucide-react"

import { MoneyInput } from "@/components/ui/MoneyInput"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states"
import { useToast } from "@/components/ui/use-toast"
import { FORECAST_REVENUE_BODY_LINE_ORDER } from "@/lib/finance/forecast/mapping/definitions"
import { formatAUD } from "@/lib/format/money"
import { cn } from "@/lib/utils"
import {
  FINANCE_FORECAST_FISCAL_MONTH_ORDER,
  FINANCE_FORECAST_LINE_LABELS,
  type FinanceForecastLineKey,
  type FinanceForecastMonthKey,
  type FinanceForecastMonthlyAmounts,
} from "@/lib/types/financeForecast"
import type {
  FinanceForecastTargetLine,
  FinanceForecastTargetUpsertCell,
} from "@/lib/types/financeForecastTargets"

const SAVE_DEBOUNCE_MS = 700

type AmountGrid = Record<FinanceForecastLineKey, FinanceForecastMonthlyAmounts>

function emptyMonthly(): FinanceForecastMonthlyAmounts {
  const m = {} as FinanceForecastMonthlyAmounts
  for (const k of FINANCE_FORECAST_FISCAL_MONTH_ORDER) m[k] = 0
  return m
}

function emptyGrid(): AmountGrid {
  const g = {} as AmountGrid
  for (const line of FORECAST_REVENUE_BODY_LINE_ORDER) {
    g[line] = emptyMonthly()
  }
  return g
}

function cellKey(line: FinanceForecastLineKey, month: FinanceForecastMonthKey): string {
  return `${line}::${month}`
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

function sumRow(monthly: FinanceForecastMonthlyAmounts): number {
  let t = 0
  for (const k of FINANCE_FORECAST_FISCAL_MONTH_ORDER) t += monthly[k] ?? 0
  return t
}

function sumColumn(grid: AmountGrid, month: FinanceForecastMonthKey): number {
  let t = 0
  for (const line of FORECAST_REVENUE_BODY_LINE_ORDER) t += grid[line][month] ?? 0
  return t
}

function sumGrand(grid: AmountGrid): number {
  let t = 0
  for (const line of FORECAST_REVENUE_BODY_LINE_ORDER) t += sumRow(grid[line])
  return t
}

function gridFromLines(lines: FinanceForecastTargetLine[]): AmountGrid {
  const grid = emptyGrid()
  for (const row of lines) {
    if (!(row.line_key in grid)) continue
    if (!(row.month_key in grid[row.line_key])) continue
    grid[row.line_key][row.month_key] = Number(row.amount) || 0
  }
  return grid
}

export type TargetGridProps = {
  fyStart: number
  /** Required Xano client id (or slug the targets API accepts as client_id). */
  clientId: string
  clientName?: string | null
}

export function TargetGrid({ fyStart, clientId, clientName }: TargetGridProps) {
  const { toast } = useToast()
  const [grid, setGrid] = useState<AmountGrid>(() => emptyGrid())
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(() => new Set())

  const pendingRef = useRef<Map<string, FinanceForecastTargetUpsertCell>>(new Map())
  const loadSeqRef = useRef(0)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const trimmedClient = clientId.trim()
  const dirty = dirtyKeys.size > 0

  const clearSaveTimer = () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
  }

  const persistPending = async () => {
    const cells = Array.from(pendingRef.current.values())
    if (cells.length === 0 || !trimmedClient) return

    setSaving(true)
    try {
      const res = await fetch("/api/finance/forecast/targets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cells }),
      })
      let body: { error?: string; message?: string } = {}
      try {
        body = (await res.json()) as typeof body
      } catch {
        body = {}
      }
      if (!res.ok) {
        throw new Error(body.message || body.error || `Save failed (${res.status})`)
      }

      const savedKeys = new Set(cells.map((c) => cellKey(c.line_key, c.month_key)))
      for (const k of savedKeys) pendingRef.current.delete(k)
      setDirtyKeys((prev) => {
        const next = new Set(prev)
        for (const k of savedKeys) next.delete(k)
        return next
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      toast({
        variant: "destructive",
        title: "Could not save targets",
        description: msg,
      })
      throw e
    } finally {
      setSaving(false)
    }
  }

  const scheduleDebouncedSave = () => {
    clearSaveTimer()
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null
      void persistPending().catch(() => {
        /* toast already shown */
      })
    }, SAVE_DEBOUNCE_MS)
  }

  const loadTargets = async () => {
    if (!trimmedClient) return
    const seq = ++loadSeqRef.current
    clearSaveTimer()
    pendingRef.current.clear()
    setDirtyKeys(new Set())
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      params.set("fy", String(fyStart))
      params.set("client_id", trimmedClient)
      const res = await fetch(`/api/finance/forecast/targets?${params.toString()}`, {
        cache: "no-store",
      })
      let body: {
        lines?: FinanceForecastTargetLine[]
        configured?: boolean
        message?: string
        error?: string
      } = {}
      try {
        body = (await res.json()) as typeof body
      } catch {
        body = {}
      }
      if (seq !== loadSeqRef.current) return
      if (!res.ok) {
        throw new Error(body.message || body.error || `Load failed (${res.status})`)
      }
      if (body.configured === false) {
        throw new Error(
          body.message ||
            "Target storage is not configured. Set XANO_FINANCE_FORECAST_TARGETS_BASE_URL or XANO_CLIENTS_BASE_URL."
        )
      }
      setGrid(gridFromLines(Array.isArray(body.lines) ? body.lines : []))
    } catch (e) {
      if (seq !== loadSeqRef.current) return
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      setGrid(emptyGrid())
    } finally {
      if (seq === loadSeqRef.current) setLoading(false)
    }
  }

  useEffect(() => {
    void loadTargets()
    return () => {
      clearSaveTimer()
      loadSeqRef.current += 1
    }
    // Reload when FY or client changes
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional keying on fyStart + clientId
  }, [fyStart, trimmedClient])

  const setCellAmount = (line: FinanceForecastLineKey, month: FinanceForecastMonthKey, value: number | null) => {
    const amount = value == null || !Number.isFinite(value) ? 0 : value
    setGrid((prev) => ({
      ...prev,
      [line]: {
        ...prev[line],
        [month]: amount,
      },
    }))

    const key = cellKey(line, month)
    pendingRef.current.set(key, {
      client_id: trimmedClient,
      financial_year_start_year: fyStart,
      line_key: line,
      month_key: month,
      amount,
      client_name: clientName ?? null,
    })
    setDirtyKeys((prev) => {
      const next = new Set(prev)
      next.add(key)
      return next
    })
    scheduleDebouncedSave()
  }

  const handleExplicitSave = () => {
    clearSaveTimer()
    void persistPending().catch(() => {
      /* toast already shown */
    })
  }

  if (!trimmedClient) {
    return (
      <EmptyState
        title="Select a client"
        message="Enter a client id in the Client filter above to edit target amounts for that client."
      />
    )
  }

  if (loading) {
    return <LoadingState rows={6} />
  }

  if (error) {
    return (
      <ErrorState
        title="Could not load targets"
        message={error}
        onRetry={() => void loadTargets()}
      />
    )
  }

  const grand = sumGrand(grid)

  return (
    <Card className="rounded-card border-border shadow-e1">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
        <div className="space-y-0.5">
          <CardTitle className="text-base font-medium">Target grid</CardTitle>
          <p className="text-xs text-muted-foreground">
            Revenue lines × FY months · client {trimmedClient}
            {clientName ? ` · ${clientName}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {dirty ? (
            <span className="rounded-pill border border-pacing-behind-bg bg-pacing-behind-bg px-2 py-0.5 text-xs font-medium text-status-behind-fg">
              Unsaved changes
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">All changes saved</span>
          )}
          <Button
            type="button"
            size="sm"
            className="h-9"
            disabled={!dirty || saving}
            onClick={handleExplicitSave}
          >
            {saving ? (
              "Saving…"
            ) : (
              <>
                <Save className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                Save
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <table className="w-full min-w-[64rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-panel">
              <th className="sticky left-0 z-10 min-w-[12rem] bg-surface-panel px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Revenue line
              </th>
              {FINANCE_FORECAST_FISCAL_MONTH_ORDER.map((m) => (
                <th
                  key={m}
                  className="min-w-[6.5rem] px-2 py-2 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  {monthColumnLabel(m, fyStart)}
                </th>
              ))}
              <th className="min-w-[7rem] px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                FY total
              </th>
            </tr>
          </thead>
          <tbody>
            {FORECAST_REVENUE_BODY_LINE_ORDER.map((line) => {
              const rowTotal = sumRow(grid[line])
              return (
                <tr key={line} className="border-b border-border hover:bg-table-row-hover">
                  <td className="sticky left-0 z-10 bg-background px-3 py-1.5 text-xs font-medium text-foreground shadow-e0">
                    {FINANCE_FORECAST_LINE_LABELS[line]}
                  </td>
                  {FINANCE_FORECAST_FISCAL_MONTH_ORDER.map((month) => (
                    <td key={month} className="px-1.5 py-1 align-middle">
                      <MoneyInput
                        value={grid[line][month]}
                        onChange={(v) => setCellAmount(line, month, v)}
                        aria-label={`${FINANCE_FORECAST_LINE_LABELS[line]} ${monthColumnLabel(month, fyStart)}`}
                        className={cn(
                          "num h-8 rounded-input border border-border bg-card px-2 text-right text-xs text-foreground",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        )}
                      />
                    </td>
                  ))}
                  <td className="num whitespace-nowrap px-3 py-1.5 text-right font-mono text-xs font-semibold text-foreground">
                    {formatAUD(rowTotal)}
                  </td>
                </tr>
              )
            })}
            <tr className="border-t border-border bg-surface-panel font-semibold">
              <td className="sticky left-0 z-10 bg-surface-panel px-3 py-2 text-xs text-foreground shadow-e0">
                Column total
              </td>
              {FINANCE_FORECAST_FISCAL_MONTH_ORDER.map((month) => (
                <td
                  key={month}
                  className="num whitespace-nowrap px-2 py-2 text-right font-mono text-xs text-foreground"
                >
                  {formatAUD(sumColumn(grid, month))}
                </td>
              ))}
              <td className="num whitespace-nowrap px-3 py-2 text-right font-mono text-xs text-foreground">
                {formatAUD(grand)}
              </td>
            </tr>
          </tbody>
        </table>
      </CardContent>
    </Card>
  )
}
