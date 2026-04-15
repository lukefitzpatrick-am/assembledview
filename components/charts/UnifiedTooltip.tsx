"use client"

import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react"
import * as React from "react"

import { formatCurrencyAUD, formatPercentage } from "@/lib/charts/format"
import { PACING_TOOLTIP_SHELL_CLASS } from "@/lib/charts/pacingLineChartStyle"
import { cn } from "@/lib/utils"

export type UnifiedTooltipPayloadItem = {
  name: string
  value: number
  color: string
  dataKey?: string
}

export type UnifiedTooltipProps = {
  active: boolean
  payload: UnifiedTooltipPayloadItem[]
  label: string
  formatValue?: (value: number) => string
  formatLabel?: (label: string) => string
  showTotal?: boolean
  showPercentages?: boolean
  comparison?: { value: number; label: string }
  maxItems?: number
  /** Denominator for row % and footer total; defaults to sum(payload). */
  seriesTotal?: number
}

export type UnifiedTooltipConfig = Omit<
  UnifiedTooltipProps,
  "active" | "payload" | "label"
> & {
  formatValue?: (value: number) => string
  formatLabel?: (label: string) => string
  showTotal?: boolean
  showPercentages?: boolean
  comparison?: { value: number; label: string }
  maxItems?: number
  /** When set, overrides sum(payload) for % and total (e.g. pie charts). */
  getSeriesTotal?: (label: string) => number | undefined
  /** Per-category comparison (e.g. budget by month on stacked bars). */
  getComparison?: (
    label: string
  ) => { value: number; label: string } | undefined
}

const defaultFormatValue = (value: number) => formatCurrencyAUD(value)
const defaultFormatPct = (value: number) => formatPercentage(value, 1)

const OTHER_ROW_COLOR = "hsl(var(--muted-foreground))"

function groupPayloadItems(
  items: UnifiedTooltipPayloadItem[],
  maxItems: number
): UnifiedTooltipPayloadItem[] {
  const cap = Math.max(1, maxItems)
  if (items.length <= cap) return items

  const sortedDesc = [...items].sort((a, b) => b.value - a.value)
  const top = sortedDesc.slice(0, cap - 1)
  const rest = sortedDesc.slice(cap - 1)
  const otherValue = rest.reduce((s, x) => s + x.value, 0)
  const otherColor = rest.length === 1 ? rest[0]!.color : OTHER_ROW_COLOR

  top.push({
    name: "Other",
    value: otherValue,
    color: otherColor,
    dataKey: "__other__",
  })
  return top
}

export function UnifiedTooltip({
  active,
  payload,
  label,
  formatValue = defaultFormatValue,
  formatLabel,
  showTotal = true,
  showPercentages = false,
  comparison,
  maxItems = 8,
  seriesTotal: seriesTotalProp,
}: UnifiedTooltipProps) {
  if (!active || !payload || payload.length === 0) return null

  const payloadSum = payload.reduce((sum, entry) => sum + (Number(entry.value) || 0), 0)
  const effectiveTotal =
    typeof seriesTotalProp === "number" && !Number.isNaN(seriesTotalProp)
      ? seriesTotalProp
      : payloadSum
  const displayPayload = groupPayloadItems(payload, maxItems)

  const displayLabel = formatLabel ? formatLabel(label) : label

  const delta =
    comparison !== undefined ? effectiveTotal - comparison.value : null
  const deltaPct =
    delta !== null && comparison!.value !== 0
      ? (delta / comparison!.value) * 100
      : null
  const isDeltaUp = delta !== null && delta > 0
  const isDeltaDown = delta !== null && delta < 0

  const listScrollable = displayPayload.length > 8

  return (
    <div className="animate-in fade-in-0 zoom-in-95 duration-150">
      <div className={cn("w-72", PACING_TOOLTIP_SHELL_CLASS)}>
        <p className="mb-2 truncate text-sm font-semibold text-foreground">
          {displayLabel}
        </p>

        <div
          className={cn(
            "space-y-1 pr-1",
            listScrollable && "max-h-52 overflow-y-auto"
          )}
        >
          {displayPayload.map((entry, index) => {
            const value = Number(entry.value) || 0
            const pct = effectiveTotal > 0 ? (value / effectiveTotal) * 100 : 0
            const key = `${entry.dataKey ?? entry.name}-${index}`
            return (
              <div
                key={key}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 flex-none rounded-full"
                    style={{ backgroundColor: entry.color }}
                    aria-hidden="true"
                  />
                  <span className="truncate text-muted-foreground">
                    {entry.name}
                  </span>
                </div>
                <div className="flex flex-none items-center gap-2">
                  <span className="font-mono text-sm font-medium tabular-nums text-foreground">
                    {formatValue(value)}
                  </span>
                  {showPercentages && effectiveTotal > 0 ? (
                    <span className="rounded-md bg-muted/80 px-1.5 py-0.5 font-mono text-xs tabular-nums text-muted-foreground">
                      {defaultFormatPct(pct)}
                    </span>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>

        {comparison !== undefined && delta !== null ? (
          <div className="mt-3 border-t border-border/80 pt-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                vs {comparison.label}
              </span>
              <span
                className={cn(
                  "inline-flex items-center gap-1 font-mono font-medium tabular-nums",
                  isDeltaUp && "text-status-success",
                  isDeltaDown && "text-status-danger",
                  !isDeltaUp && !isDeltaDown && "text-muted-foreground"
                )}
              >
                {isDeltaUp ? (
                  <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                ) : isDeltaDown ? (
                  <ArrowDownRight className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {delta > 0 ? "+" : ""}
                {formatValue(delta)}
                {deltaPct !== null ? ` (${defaultFormatPct(deltaPct)})` : ""}
              </span>
            </div>
          </div>
        ) : null}

        {showTotal ? (
          <div className="mt-3 border-t border-border/80 pt-2">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-foreground">Total</span>
              <span className="font-mono tabular-nums text-foreground">
                {formatValue(effectiveTotal)}
              </span>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

/** Recharts tooltip `payload` entry shape (subset). */
export type UnifiedTooltipRechartsPayloadEntry = {
  name?: string
  value?: number | string
  color?: string
  stroke?: string
  fill?: string
  dataKey?: string | number
}

export type UnifiedTooltipRechartsProps = {
  active?: boolean
  payload?: UnifiedTooltipRechartsPayloadEntry[]
  label?: string | number | React.ReactNode
}

export function normalizeRechartsTooltipPayload(
  payload: UnifiedTooltipRechartsPayloadEntry[] | undefined
): UnifiedTooltipPayloadItem[] {
  if (!payload?.length) return []
  const out: UnifiedTooltipPayloadItem[] = []
  for (let i = 0; i < payload.length; i++) {
    const entry = payload[i]!
    const raw = entry.value
    const value =
      typeof raw === "number"
        ? raw
        : typeof raw === "string"
          ? Number(raw)
          : NaN
    if (Number.isNaN(value)) continue
    const name = String(entry.name ?? entry.dataKey ?? "Series")
    const color = String(
      entry.color ?? entry.stroke ?? entry.fill ?? "hsl(var(--muted-foreground))"
    )
    const dataKey =
      entry.dataKey !== undefined && entry.dataKey !== null
        ? String(entry.dataKey)
        : undefined
    out.push({ name, value, color, dataKey })
  }
  return out
}

function rechartsLabelToString(label: UnifiedTooltipRechartsProps["label"]): string {
  if (label == null) return ""
  if (typeof label === "string" || typeof label === "number") return String(label)
  return ""
}

/**
 * Returns a render function for `<Tooltip content={renderTooltip} />` with shared config.
 */
export function useUnifiedTooltip(
  config: UnifiedTooltipConfig = {}
): (props: UnifiedTooltipRechartsProps) => React.ReactNode {
  const {
    formatValue,
    formatLabel,
    showTotal,
    showPercentages,
    comparison,
    maxItems,
    getSeriesTotal,
    getComparison,
  } = config

  return React.useCallback(
    (props: UnifiedTooltipRechartsProps) => {
      const normalized = normalizeRechartsTooltipPayload(props.payload)
      const labelStr = rechartsLabelToString(props.label)
      const fromGetter = getSeriesTotal?.(labelStr)
      const seriesTotalOverride =
        typeof fromGetter === "number" && !Number.isNaN(fromGetter)
          ? fromGetter
          : undefined
      const resolvedComparison =
        getComparison?.(labelStr) ?? comparison
      return (
        <UnifiedTooltip
          active={props.active ?? false}
          payload={normalized}
          label={labelStr}
          formatValue={formatValue}
          formatLabel={formatLabel}
          showTotal={showTotal}
          showPercentages={showPercentages}
          comparison={resolvedComparison}
          maxItems={maxItems}
          seriesTotal={seriesTotalOverride}
        />
      )
    },
    [
      formatValue,
      formatLabel,
      showTotal,
      showPercentages,
      comparison,
      maxItems,
      getSeriesTotal,
      getComparison,
    ]
  )
}
