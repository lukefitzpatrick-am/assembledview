"use client"

import { useMemo, useState } from "react"
import { cn } from "@/lib/utils"
import { formatAUD, formatMoney } from "@/lib/format/money"
import {
  aggregateInvestmentShares,
  monthKeyToDate,
  type InvestmentBurstInput,
} from "@/lib/billing/prorateInvestmentDisplay"
import {
  mediaTypeAccentTextStyle,
  mediaTypeTotalsRowStyle,
  rgbaFromHex,
} from "@/lib/mediaplan/mediaTypeAccents"

type SummaryLine = {
  index: number
  deliverables: number
  buyType: string
  media: number
  fee: number
  totalCost: number
  /** Ordered display dimensions, e.g. { Network: "News Corp", Title: "Herald Sun", "Buy Type": "Fixed Fee" } */
  dimensions: Record<string, string>
  /** Per-burst total (media + fee) with dates, for the monthly pivot */
  bursts: InvestmentBurstInput[]
}

type MediaContainerSummarySectionProps = {
  lines: SummaryLine[]
  overallMedia: number
  overallFee: number
  overallCost: number
  /** e.g. "Fee (10%)" */
  feeLabel: string
  accentHex: string
  /** Group-by options, in display order. Keys must exist in each line's `dimensions`. */
  dimensions: string[]
  deliverablesLabelFor?: (buyType: string) => string
}

const formatWholeAUD = (n: number) =>
  formatMoney(n, {
    locale: "en-AU",
    currency: "AUD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }) || "$0"

/** "January 2026" → "Jan 26" */
const shortMonthKey = (key: string) => {
  const m = key.match(/^([A-Za-z]{3})[A-Za-z]*\s+\d{2}(\d{2})$/)
  return m ? `${m[1]} ${m[2]}` : key
}

export default function MediaContainerSummarySection({
  lines,
  overallMedia,
  overallFee,
  overallCost,
  feeLabel,
  accentHex,
  dimensions,
  deliverablesLabelFor,
}: MediaContainerSummarySectionProps) {
  const [groupBy, setGroupBy] = useState(dimensions[0] ?? "")
  const [byMonth, setByMonth] = useState(false)

  const groups = useMemo(() => {
    const map = new Map<string, { total: number; lineCount: number; bursts: InvestmentBurstInput[] }>()
    for (const line of lines) {
      const key = line.dimensions[groupBy]?.trim() || "—"
      const entry = map.get(key) ?? { total: 0, lineCount: 0, bursts: [] }
      entry.total += line.totalCost
      entry.lineCount += 1
      entry.bursts.push(...line.bursts)
      map.set(key, entry)
    }
    return Array.from(map.entries())
      .map(([name, g]) => ({ name, ...g }))
      .sort((a, b) => b.total - a.total)
  }, [lines, groupBy])

  const monthly = useMemo(() => {
    if (!byMonth) return null
    const perGroup = groups.map((g) => ({ name: g.name, shares: aggregateInvestmentShares(g.bursts) }))
    const keySet = new Set<string>()
    perGroup.forEach((g) => Object.keys(g.shares).forEach((k) => keySet.add(k)))
    const monthKeys = Array.from(keySet).sort(
      (a, b) => monthKeyToDate(a).getTime() - monthKeyToDate(b).getTime()
    )
    const columnTotals = monthKeys.map((k) =>
      perGroup.reduce((sum, g) => sum + (g.shares[k] ?? 0), 0)
    )
    return { perGroup, monthKeys, columnTotals }
  }, [byMonth, groups])

  const maxGroupTotal = groups.length ? groups[0].total : 0

  return (
    <div className="grid gap-x-8 gap-y-4 lg:grid-cols-3">
      {/* Left third — per-line detail + totals */}
      <div className="lg:col-span-1">
        {lines.map((line) => (
          <div
            key={line.index}
            className="flex items-center justify-between gap-3 py-2.5 border-b border-border/40 last:border-b-0"
          >
            <span className="text-sm font-medium text-muted-foreground shrink-0">
              Line {line.index}
            </span>
            <div className="text-right tabular-nums min-w-0">
              <span className="text-sm font-semibold block">{formatAUD(line.totalCost)}</span>
              <span className="text-[11px] text-muted-foreground block truncate">
                {formatAUD(line.media)} media · {formatAUD(line.fee)} fee ·{" "}
                {line.deliverables.toLocaleString(undefined, { maximumFractionDigits: 0 })}{" "}
                {(deliverablesLabelFor?.(line.buyType) ?? "deliverables").toLowerCase()}
              </span>
            </div>
          </div>
        ))}

        <div
          className="flex items-center justify-between border-t-2 border-solid pt-3 mt-1"
          style={mediaTypeTotalsRowStyle(accentHex)}
        >
          <span className="text-sm font-semibold">Total</span>
          <div className="flex items-center gap-4 text-sm font-semibold tabular-nums">
            <div className="text-right">
              <span className="text-[11px] text-muted-foreground font-normal block">Media</span>
              <span>{formatAUD(overallMedia)}</span>
            </div>
            <div className="text-right">
              <span className="text-[11px] text-muted-foreground font-normal block">{feeLabel}</span>
              <span>{formatAUD(overallFee)}</span>
            </div>
            <div className="text-right">
              <span className="text-[11px] text-muted-foreground font-normal block">Total</span>
              <span style={mediaTypeAccentTextStyle(accentHex)}>{formatAUD(overallCost)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right two-thirds — grouped spend */}
      <div className="lg:col-span-2 lg:border-l lg:border-border/40 lg:pl-8">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
          <div
            role="group"
            aria-label="Group spend by"
            className="inline-flex rounded-lg border border-border bg-muted/50 p-0.5"
          >
            {dimensions.map((dim) => (
              <button
                key={dim}
                type="button"
                aria-pressed={groupBy === dim}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-all",
                  groupBy === dim ? "text-white shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
                style={groupBy === dim ? { backgroundColor: accentHex } : undefined}
                onClick={() => setGroupBy(dim)}
              >
                {dim}
              </button>
            ))}
          </div>
          <div
            role="group"
            aria-label="Spend view"
            className="inline-flex rounded-lg border border-border bg-muted/50 p-0.5"
          >
            {(["Total", "By month"] as const).map((view) => {
              const active = view === "By month" ? byMonth : !byMonth
              return (
                <button
                  key={view}
                  type="button"
                  aria-pressed={active}
                  title={
                    view === "By month"
                      ? "Split group spend across campaign months"
                      : "Show total spend per group for the whole campaign"
                  }
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium transition-all",
                    active ? "text-white shadow-sm" : "text-muted-foreground hover:text-foreground"
                  )}
                  style={active ? { backgroundColor: accentHex } : undefined}
                  onClick={() => setByMonth(view === "By month")}
                >
                  {view}
                </button>
              )
            })}
          </div>
        </div>

        {groups.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">No spend entered yet.</p>
        ) : !byMonth ? (
          <div>
            {groups.map((group) => {
              const share = overallCost > 0 ? group.total / overallCost : 0
              return (
                <div
                  key={group.name}
                  className="flex items-center gap-3 py-2 border-b border-border/40 last:border-b-0"
                >
                  <div className="w-2/5 min-w-0">
                    <span className="text-sm font-medium block truncate" title={group.name}>
                      {group.name}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {group.lineCount} line{group.lineCount !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${maxGroupTotal > 0 ? Math.max((group.total / maxGroupTotal) * 100, 2) : 0}%`,
                        backgroundColor: rgbaFromHex(accentHex, 0.8),
                      }}
                    />
                  </div>
                  <div className="w-32 text-right tabular-nums shrink-0">
                    <span className="text-sm font-semibold block">{formatAUD(group.total)}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {(share * 100).toLocaleString(undefined, { maximumFractionDigits: 1 })}%
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        ) : monthly ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="border-b border-border/60 text-[11px] text-muted-foreground">
                  <th className="py-1.5 pr-3 text-left font-normal">{groupBy}</th>
                  {monthly.monthKeys.map((k) => (
                    <th key={k} className="py-1.5 px-2 text-right font-normal whitespace-nowrap">
                      {shortMonthKey(k)}
                    </th>
                  ))}
                  <th className="py-1.5 pl-3 text-right font-normal">Total</th>
                </tr>
              </thead>
              <tbody>
                {monthly.perGroup.map((g, i) => (
                  <tr key={g.name} className="border-b border-border/40 last:border-b-0">
                    <td className="py-2 pr-3 max-w-[160px] truncate font-medium" title={g.name}>
                      {g.name}
                    </td>
                    {monthly.monthKeys.map((k) => (
                      <td key={k} className="py-2 px-2 text-right whitespace-nowrap">
                        {g.shares[k] ? formatWholeAUD(g.shares[k]) : "–"}
                      </td>
                    ))}
                    <td className="py-2 pl-3 text-right font-semibold whitespace-nowrap">
                      {formatWholeAUD(groups[i]?.total ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2" style={mediaTypeTotalsRowStyle(accentHex)}>
                  <td className="py-2 pr-3 font-semibold">Total</td>
                  {monthly.columnTotals.map((total, idx) => (
                    <td key={monthly.monthKeys[idx]} className="py-2 px-2 text-right font-semibold whitespace-nowrap">
                      {formatWholeAUD(total)}
                    </td>
                  ))}
                  <td className="py-2 pl-3 text-right font-semibold whitespace-nowrap">
                    <span style={mediaTypeAccentTextStyle(accentHex)}>{formatWholeAUD(overallCost)}</span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  )
}
