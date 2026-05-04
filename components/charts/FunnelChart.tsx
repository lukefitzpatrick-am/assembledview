"use client"

import { Fragment, useMemo } from "react"
import { Cell, Funnel, FunnelChart as RechartsFunnelChart, ResponsiveContainer, Tooltip } from "recharts"

import { useClientBrand } from "@/components/client-dashboard/ClientBrandProvider"
import { useUnifiedTooltip } from "@/components/charts/UnifiedTooltip"
import { getChartPalette } from "@/lib/client-dashboard/theme"

export type FunnelDatum = { name: string; value: number }

export type FunnelChartProps = {
  data: FunnelDatum[]
  height?: number
}

function formatPct(n: number | null): string {
  if (n == null || Number.isNaN(n)) return "—"
  return `${n.toFixed(1)}%`
}

export function FunnelChart({ data, height = 360 }: FunnelChartProps) {
  const theme = useClientBrand()
  const palette = useMemo(() => getChartPalette(theme), [theme])

  const rows = useMemo(() => {
    const first = data[0]?.value
    return data.map((d, i) => {
      const prevVal = i > 0 ? data[i - 1]?.value : null
      const vsPrev =
        prevVal != null && prevVal > 0 ? (Number(d.value) / Number(prevVal)) * 100 : null
      const vsFirst = first != null && first > 0 ? (Number(d.value) / Number(first)) * 100 : null
      return { ...d, vsPrev, vsFirst, index: i + 1 }
    })
  }, [data])

  const chartHeight = Math.max(180, Math.round(height * 0.58))

  const renderTooltip = useUnifiedTooltip({
    // Funnel stages are counts (sessions, checkouts, etc.); not currency.
    formatValue: (v) => v.toLocaleString("en-AU", { maximumFractionDigits: 0 }),
    showTotal: false,
  })

  return (
    <div className="w-full space-y-4" style={{ minHeight: height }}>
      <div className="w-full" style={{ height: chartHeight }}>
        <ResponsiveContainer width="100%" height="100%">
          <RechartsFunnelChart margin={{ top: 8, right: 24, left: 24, bottom: 8 }}>
            <Tooltip content={renderTooltip} />
            <Funnel dataKey="value" nameKey="name" data={data} isAnimationActive={false}>
              {data.map((d, i) => (
                <Cell key={d.name} fill={palette[i % palette.length]} />
              ))}
            </Funnel>
          </RechartsFunnelChart>
        </ResponsiveContainer>
      </div>

      <div className="grid w-full grid-cols-5 gap-x-2 gap-y-1 rounded-md border border-border bg-card px-2 py-2 text-xs sm:text-sm">
        <div className="font-semibold text-muted-foreground">#</div>
        <div className="font-semibold text-muted-foreground">Stage</div>
        <div className="text-right font-semibold text-muted-foreground">Value</div>
        <div className="text-right font-semibold text-muted-foreground">vs prev</div>
        <div className="text-right font-semibold text-muted-foreground">vs first</div>
        {rows.map((r) => (
          <Fragment key={r.name}>
            <div className="tabular-nums text-muted-foreground">{r.index}</div>
            <div className="min-w-0 truncate font-medium">{r.name}</div>
            <div className="text-right tabular-nums">
              {r.value.toLocaleString("en-AU", { maximumFractionDigits: 0 })}
            </div>
            <div className="text-right tabular-nums text-muted-foreground">{formatPct(r.vsPrev)}</div>
            <div className="text-right tabular-nums text-muted-foreground">{formatPct(r.vsFirst)}</div>
          </Fragment>
        ))}
      </div>
    </div>
  )
}

/** @deprecated Use `FunnelChart` — renamed in chart consolidation. */
export const FunnelViz = FunnelChart

/** @deprecated Use `FunnelChartProps` */
export type FunnelVizProps = FunnelChartProps
