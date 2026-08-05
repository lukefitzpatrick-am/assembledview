'use client'

/**
 * Share breakdown under a composition chart (donut).
 * AT fallback for charts whose SVG has no text alternative (M2 in
 * claude/av-review/client-dashboards.md) — this legend is the accessible readout.
 */
import * as React from 'react'
import { fmt } from '@/lib/chart-theme'
import {
  buildShareBreakdownRows,
  type ShareBreakdownItem,
} from '@/lib/charts/shareBreakdown'
import { cn } from '@/lib/utils'

export type { ShareBreakdownItem, ShareBreakdownRow } from '@/lib/charts/shareBreakdown'
export { buildShareBreakdownRows, allocateSharePercents } from '@/lib/charts/shareBreakdown'

export interface ShareBreakdownLegendProps {
  items: ShareBreakdownItem[]
  total: number
  valueFormat?: 'dollars' | 'number'
  maxRows?: number
  className?: string
}

function formatValue(n: number, valueFormat: 'dollars' | 'number'): string {
  return valueFormat === 'number' ? fmt.compact(n) : fmt.currencyCompact(n)
}

/**
 * Compact share legend for part-to-whole charts. Place under the chart inside
 * BaseChartCard children so PNG export captures it (not the shell `legend` slot).
 */
export function ShareBreakdownLegend({
  items,
  total,
  valueFormat = 'dollars',
  maxRows = 8,
  className,
}: ShareBreakdownLegendProps) {
  const captionId = React.useId()
  const rows = React.useMemo(
    () => buildShareBreakdownRows(items, total, maxRows),
    [items, total, maxRows],
  )

  if (!rows || rows.length === 0) return null

  return (
    <div className={cn('mt-3 w-full', className)}>
      {/* Donut SVG has no text alternative (M2) — this dl is the AT fallback. */}
      <p className="sr-only" id={captionId}>
        Planned media mix by type: label, amount, and share of total.
      </p>
      <dl
        aria-labelledby={captionId}
        className="grid grid-cols-1 gap-x-4 gap-y-1.5 text-[11.5px] leading-snug sm:grid-cols-2"
      >
        {rows.map((row) => (
          <div key={row.label} className="flex min-w-0 items-center gap-2">
            <dt className="flex min-w-0 flex-1 items-center gap-2 font-medium text-foreground">
              <span
                className="block h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{ background: row.color }}
                aria-hidden
              />
              <span className="truncate">{row.label}</span>
            </dt>
            <dd className="m-0 shrink-0 text-right tabular-nums text-muted-foreground num">
              {formatValue(row.value, valueFormat)}
            </dd>
            <dd className="m-0 w-12 shrink-0 text-right tabular-nums text-muted-foreground num">
              <span className="sr-only">share </span>
              {row.sharePct.toFixed(1)}%
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
