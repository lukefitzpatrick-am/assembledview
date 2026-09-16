"use client"

import { useMemo, useState } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import {
  SortableTableHeader,
  type SortDirection,
} from "@/components/ui/sortable-table-header"
import { PACING_TABLE_SCROLL_CLASSNAME } from "@/components/pacing/pacingTableScroll"
import { formatMoney, formatMoneyCompact, formatPercent } from "@/lib/format/money"
import type { CampaignPacingRow, ChannelPacingRow } from "@/lib/pacing/portfolio/types"
import {
  CHANNEL_SOURCE_STATE_LABEL,
  campaignDisplayBand,
  campaignPaceLabel,
  displayBandBadgeVariant,
  displayBandFillClass,
  displayBandTextClass,
  paceToDisplayBand,
} from "@/lib/pacing/portfolio/portfolioPresentation"
import {
  sortCampaignPacingRows,
  type PortfolioSortColumn,
} from "@/lib/pacing/portfolio/sortCampaignPacingRows"
import { cn } from "@/lib/utils"

const NUMERIC_SORT_COLUMNS = new Set<PortfolioSortColumn>([
  "timePct",
  "spendPct",
  "spent",
  "budget",
  "projected",
  "yesterday",
])

function clampPct(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, value))
}

function formatWhole(value: number): string {
  return formatMoney(value, { decimals: 0 })
}

function channelPaceLabel(channel: ChannelPacingRow): string {
  if (channel.sourceState !== "reporting") {
    return CHANNEL_SOURCE_STATE_LABEL[channel.sourceState]
  }
  switch (paceToDisplayBand(channel.pace)) {
    case "behind":
      return "Behind"
    case "on-track":
      return "On track"
    case "ahead":
      return "Ahead"
    case "over-pacing":
      return "Over-pacing"
    case "no-data":
      return "No data"
    default:
      return channel.pace
  }
}

function SpendPaceCell({
  spendPct,
  timePct,
  fillClass,
  textClass,
}: {
  spendPct: number
  timePct: number
  fillClass: string
  textClass: string
}) {
  const fill = clampPct(spendPct)
  const tick = clampPct(timePct)
  return (
    <div className="flex items-center justify-end gap-2">
      <span className="relative inline-block h-1.5 w-[90px] overflow-visible rounded-pill bg-fill-track">
        <span
          className={cn("absolute inset-y-0 left-0 rounded-pill", fillClass)}
          style={{ width: `${fill}%` }}
        />
        <span
          className="absolute top-[-3px] bottom-[-3px] w-0.5 bg-foreground/70"
          style={{ left: `${tick}%` }}
          aria-hidden
        />
      </span>
      <span className={cn("num text-xs font-semibold", textClass)}>
        {formatPercent(spendPct, { decimals: 0 })}
      </span>
    </div>
  )
}

function SortableTh({
  label,
  column,
  sortColumn,
  sortDirection,
  onToggle,
  align = "right",
}: {
  label: string
  column: PortfolioSortColumn
  sortColumn: PortfolioSortColumn | null
  sortDirection: SortDirection
  onToggle: (column: PortfolioSortColumn) => void
  align?: "left" | "right"
}) {
  return (
    <SortableTableHeader
      label={label}
      direction={sortColumn === column ? sortDirection : null}
      onToggle={() => onToggle(column)}
      align={align}
      className="sticky top-0 z-20 bg-background"
    />
  )
}

export function CampaignPacingTable({ rows }: { rows: CampaignPacingRow[] }) {
  const [sortColumn, setSortColumn] = useState<PortfolioSortColumn | null>(null)
  const [sortDirection, setSortDirection] = useState<Exclude<SortDirection, null>>("desc")
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())

  const sorted = useMemo(
    () => sortCampaignPacingRows(rows, sortColumn, sortDirection),
    [rows, sortColumn, sortDirection],
  )

  function toggleSort(column: PortfolioSortColumn) {
    if (sortColumn === column) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"))
      return
    }
    setSortColumn(column)
    setSortDirection(NUMERIC_SORT_COLUMNS.has(column) ? "desc" : "asc")
  }

  function toggleExpanded(mbaNumber: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(mbaNumber)) next.delete(mbaNumber)
      else next.add(mbaNumber)
      return next
    })
  }

  return (
    <div className={PACING_TABLE_SCROLL_CLASSNAME}>
      <table className="w-full caption-bottom text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="sticky top-0 z-20 bg-background px-3 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Client · campaign
            </th>
            <SortableTh
              label="Pace"
              column="pace"
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              onToggle={toggleSort}
              align="left"
            />
            <SortableTh
              label="Time %"
              column="timePct"
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              onToggle={toggleSort}
            />
            <SortableTh
              label="Spend pace"
              column="spendPct"
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              onToggle={toggleSort}
            />
            <SortableTh
              label="Spent"
              column="spent"
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              onToggle={toggleSort}
            />
            <SortableTh
              label="Budget"
              column="budget"
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              onToggle={toggleSort}
            />
            <SortableTh
              label="Projected"
              column="projected"
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              onToggle={toggleSort}
            />
            <SortableTh
              label="Yesterday"
              column="yesterday"
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              onToggle={toggleSort}
            />
            <th className="sticky top-0 z-20 bg-background px-3 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
              KPIs
            </th>
            <th className="sticky top-0 z-20 bg-background px-3 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Why
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => {
            const band = campaignDisplayBand(row)
            const isOpen = expanded.has(row.mbaNumber)
            const kpiValue = row.kpi ? `${row.kpi.tracked} of ${row.kpi.total}` : "—"
            return (
              <CampaignGroup
                key={row.mbaNumber}
                row={row}
                band={band}
                isOpen={isOpen}
                kpiValue={kpiValue}
                onToggle={() => toggleExpanded(row.mbaNumber)}
              />
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function CampaignGroup({
  row,
  band,
  isOpen,
  kpiValue,
  onToggle,
}: {
  row: CampaignPacingRow
  band: ReturnType<typeof campaignDisplayBand>
  isOpen: boolean
  kpiValue: string
  onToggle: () => void
}) {
  return (
    <>
      <tr
        data-level="campaign"
        data-mba={row.mbaNumber}
        className="interactive-row border-b border-border bg-card"
      >
        <td className="px-3 py-2.5 align-middle">
          <div className="flex items-start gap-1.5">
            <button
              type="button"
              aria-expanded={isOpen}
              aria-label={isOpen ? `Collapse ${row.mbaNumber}` : `Expand ${row.mbaNumber}`}
              onClick={onToggle}
              className="mt-0.5 rounded-input p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {isOpen ? (
                <ChevronDown className="h-4 w-4" aria-hidden />
              ) : (
                <ChevronRight className="h-4 w-4" aria-hidden />
              )}
            </button>
            <div className="min-w-0">
              <p className="text-sm text-foreground">
                {row.clientName} · {row.campaignName}{" "}
                <span className="font-mono text-[11px] font-normal text-muted-foreground">
                  {row.mbaNumber}
                </span>
              </p>
            </div>
          </div>
        </td>
        <td className="px-3 py-2.5 align-middle">
          <Badge variant={displayBandBadgeVariant(band)} size="sm" dot>
            {campaignPaceLabel(row)}
          </Badge>
        </td>
        <td className="num px-3 py-2.5 text-right align-middle">
          {formatPercent(row.timePct, { decimals: 0 })}
        </td>
        <td className="px-3 py-2.5 text-right align-middle">
          <SpendPaceCell
            spendPct={row.spendPct}
            timePct={row.timePct}
            fillClass={displayBandFillClass(band)}
            textClass={displayBandTextClass(band)}
          />
        </td>
        <td className="num px-3 py-2.5 text-right align-middle">{formatWhole(row.spendToDate)}</td>
        <td className="num px-3 py-2.5 text-right align-middle">{formatWhole(row.budget)}</td>
        <td className="num px-3 py-2.5 text-right align-middle">
          {row.projectedFinish != null ? formatMoneyCompact(row.projectedFinish) : "—"}
        </td>
        <td className="num px-3 py-2.5 text-right align-middle">
          {formatWhole(row.spendYesterday)}
        </td>
        <td className="num px-3 py-2.5 align-middle">{kpiValue}</td>
        <td className="max-w-[220px] truncate px-3 py-2.5 align-middle text-xs text-muted-foreground" title={row.why}>
          {row.why || "—"}
        </td>
      </tr>
      {isOpen
        ? row.channels.map((channel) => {
            const chBand = paceToDisplayBand(channel.pace)
            return (
              <tr
                key={`${row.mbaNumber}:${channel.channelKey}`}
                data-level="channel"
                data-mba={row.mbaNumber}
                data-channel={channel.channelKey}
                className="border-b border-border bg-surface-panel"
              >
                <td className="px-3 py-2 pl-10 align-middle text-muted-foreground">
                  {channel.label}
                </td>
                <td className="px-3 py-2 align-middle">
                  <Badge variant={displayBandBadgeVariant(chBand)} size="sm" dot>
                    {channelPaceLabel(channel)}
                  </Badge>
                </td>
                <td className="px-3 py-2 text-right align-middle" />
                <td className="px-3 py-2 text-right align-middle">
                  <SpendPaceCell
                    spendPct={channel.spendPct}
                    timePct={row.timePct}
                    fillClass={displayBandFillClass(chBand)}
                    textClass={displayBandTextClass(chBand)}
                  />
                </td>
                <td className="num px-3 py-2 text-right align-middle">
                  {formatWhole(channel.spendToDate)}
                </td>
                <td className="num px-3 py-2 text-right align-middle">
                  {formatWhole(channel.budget)}
                </td>
                <td className="px-3 py-2 text-right align-middle" />
                <td className="num px-3 py-2 text-right align-middle">—</td>
                <td className="px-3 py-2 align-middle" />
                <td className="px-3 py-2 align-middle" />
              </tr>
            )
          })
        : null}
    </>
  )
}
