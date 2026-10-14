"use client"

import type { CSSProperties, ReactNode } from "react"

import { ComboChart } from "@/components/charts/system"
import { DELIVERY_CHART_CHANNEL_HEIGHT_CLASS } from "@/components/dashboard/delivery/common/deliveryChartSpec"
import { formatMoneyCompact, formatPercent } from "@/lib/format/money"
import { relativeChange, formatChange } from "@/lib/webReport/change"
import { elementViewState } from "@/lib/webReport/elementState"
import {
  WEB_REPORT_ELEMENTS,
  parseElementSettings,
  type WebElementId,
  type WebMetric,
  type WebReportLayoutItem,
} from "@/lib/webReport/elements"
import type { PageRow, PeriodTotals, SourceMediumRow, WebReportData } from "@/lib/webReport/types"

const NUMBER = new Intl.NumberFormat("en-AU", { maximumFractionDigits: 0 })
const POSITION = new Intl.NumberFormat("en-AU", { minimumFractionDigits: 1, maximumFractionDigits: 1 })

function formatMetric(metric: WebMetric, totals: PeriodTotals, paid: number | null): string {
  if (metric === "avSpend") return formatMoneyCompact(paid)
  if (metric === "users" || metric === "newUsers") return "—"
  const value = totals[metric]
  if (value == null) return "—"
  if (metric === "engagementRate" || metric === "ctr") return formatPercent(value * 100)
  if (metric === "position") return POSITION.format(value)
  return NUMBER.format(value)
}

function metricValue(metric: WebMetric, totals: PeriodTotals, paid: number | null): number | null {
  if (metric === "avSpend") return paid
  if (metric === "users" || metric === "newUsers") return null
  return totals[metric]
}

const METRIC_LABEL: Record<WebMetric, string> = {
  users: "Users",
  newUsers: "New users",
  sessions: "Sessions",
  engagementRate: "Engagement rate",
  keyEvents: "Key events",
  pageViews: "Page views",
  clicks: "Clicks",
  impressions: "Impressions",
  ctr: "CTR",
  position: "Position",
  avSpend: "AV spend",
}

export function ChangeValue({ current, previous }: { current: number | null; previous: number | null }) {
  const change = relativeChange(current, previous)
  const text = formatChange(change)
  const tone =
    change == null || change === 0
      ? "text-muted-foreground"
      : change > 0
        ? "text-status-ahead-fg"
        : "text-status-behind-fg"
  return <span className={`num ${tone}`}>{text}</span>
}

function Shell({ title, message, children }: { title: string; message: string; children?: ReactNode }) {
  return (
    <section className="rounded-card border border-border bg-card p-4 shadow-e1">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {message ? <p className="mt-3 text-sm text-muted-foreground">{message}</p> : children}
    </section>
  )
}

function Tiles({
  tiles,
  data,
}: {
  tiles: { label: string; metric: WebMetric; target?: number; unavailable?: boolean }[]
  data: WebReportData
}) {
  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {tiles.map((tile) => {
        const current = metricValue(tile.metric, data.ga4.current, data.paid.spend)
        const gscCurrent = metricValue(tile.metric, data.gsc.current, data.paid.spend)
        const value = tile.metric === "clicks" || tile.metric === "impressions" || tile.metric === "ctr" || tile.metric === "position"
          ? gscCurrent
          : tile.metric === "avSpend"
            ? data.paid.spend
            : current
        const previousBase =
          tile.metric === "clicks" || tile.metric === "impressions" || tile.metric === "ctr" || tile.metric === "position"
            ? metricValue(tile.metric, data.gsc.previous, data.paid.previousSpend)
            : tile.metric === "avSpend"
              ? data.paid.previousSpend
              : metricValue(tile.metric, data.ga4.previous, data.paid.previousSpend)
        const display =
          tile.metric === "clicks" || tile.metric === "impressions" || tile.metric === "ctr" || tile.metric === "position"
            ? formatMetric(tile.metric, data.gsc.current, data.paid.spend)
            : formatMetric(tile.metric, data.ga4.current, data.paid.spend)
        const unavailable = tile.unavailable === true || tile.metric === "users" || tile.metric === "newUsers"
        return (
          <div key={tile.label} className="rounded-input border border-border bg-surface-panel p-3">
            <p className="text-xs text-muted-foreground">{tile.label}</p>
            <p className="num mt-1 text-xl font-semibold text-foreground">{unavailable ? "Not available yet" : display}</p>
            {tile.target != null ? (
              <p className="num mt-1 text-xs text-muted-foreground">Target {NUMBER.format(tile.target)}</p>
            ) : null}
            <p className="mt-1 text-xs">
              <ChangeValue current={unavailable ? null : value} previous={unavailable ? null : previousBase} />
            </p>
          </div>
        )
      })}
    </div>
  )
}

function PageTable({ rows, topN }: { rows: PageRow[]; topN: number }) {
  const shown = rows.slice(0, topN)
  if (shown.length === 0) return <p className="mt-3 text-sm text-muted-foreground">No rows in this period.</p>
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted-foreground">
            <th className="py-2 pr-3 font-medium">Page path</th>
            <th className="py-2 pr-3 font-medium">Page views</th>
            <th className="py-2 pr-3 font-medium">Users</th>
            <th className="py-2 font-medium">Key events</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((row) => (
            <tr key={row.page} className="border-t border-border">
              <td className="max-w-[280px] truncate py-2 pr-3">{row.page}</td>
              <td className="num py-2 pr-3">{NUMBER.format(row.pageViews)}</td>
              <td className="num py-2 pr-3">{NUMBER.format(row.users)}</td>
              <td className="num py-2">{NUMBER.format(row.keyEvents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-muted-foreground">Page path from the landing report. Page title is not on that view.</p>
    </div>
  )
}

function shadeStyle(share: number): CSSProperties | undefined {
  if (!Number.isFinite(share) || share <= 0) return undefined
  return { backgroundColor: `color-mix(in srgb, var(--pacing-ahead) ${Math.round(share * 28)}%, transparent)` }
}

export function WebReportElement({ item, data }: { item: WebReportLayoutItem; data: WebReportData }) {
  const definition = WEB_REPORT_ELEMENTS[item.elementId]
  const parsed = parseElementSettings(item.elementId, item.settings)
  if (!parsed.ok) {
    return <Shell title={definition?.title ?? item.elementId} message="This element is not set up yet." />
  }
  const view = elementViewState(item.elementId, data)
  if (view.status !== "ok") {
    return <Shell title={definition.title} message={view.message} />
  }
  return <ElementBody id={item.elementId} settings={parsed.settings} data={data} title={definition.title} />
}

function ElementBody({
  id,
  settings,
  data,
  title,
}: {
  id: WebElementId
  settings: unknown
  data: WebReportData
  title: string
}) {
  if (id === "notes") {
    const text = (settings as { text: string }).text
    return (
      <Shell title={title} message="">
        <p className="mt-3 whitespace-pre-wrap text-sm text-foreground">{text}</p>
      </Shell>
    )
  }
  if (id === "kpis") {
    const tiles = (settings as { tiles: { kind: string; metric?: WebMetric; eventName?: string; target?: number }[] }).tiles
    return (
      <Shell title={title} message="">
        <Tiles
          data={data}
          tiles={tiles.map((tile) => ({
            label: tile.kind === "keyEvent" ? (tile.eventName ?? "Key event") : METRIC_LABEL[tile.metric ?? "sessions"],
            metric: tile.metric ?? "keyEvents",
            target: tile.target,
            unavailable: tile.kind === "keyEvent",
          }))}
        />
      </Shell>
    )
  }
  if (id === "snapshot") {
    const tiles = (settings as { tiles: WebMetric[] }).tiles
    return (
      <Shell title={title} message="">
        <Tiles data={data} tiles={tiles.map((metric) => ({ label: METRIC_LABEL[metric], metric }))} />
      </Shell>
    )
  }
  if (id === "traffic") {
    const bars = (settings as { bars: ("pageViews" | "sessions")[] }).bars
    const chartData = data.ga4.daily.map((point) => ({
      date: point.date.slice(5),
      sessions: point.sessions ?? 0,
      pageViews: point.pageViews ?? 0,
      keyEvents: point.keyEvents ?? 0,
    }))
    return (
      <Shell title={title} message="">
        <ComboChart
          className={DELIVERY_CHART_CHANNEL_HEIGHT_CLASS}
          data={chartData}
          xKey="date"
          bars={bars.map((key) => ({
            key,
            label: key === "pageViews" ? "Page views" : "Sessions",
            color: key === "pageViews" ? "var(--av-chart-2)" : "var(--av-chart-1)",
          }))}
          line={{ key: "keyEvents", label: "Key events", color: "var(--av-ink)" }}
        />
      </Shell>
    )
  }
  if (id === "srcmed") {
    const spec = settings as { topN: number; columns: ("sessions" | "keyEvents" | "engagementRate")[]; showChange: boolean; shade: boolean }
    return (
      <Shell title={title} message="">
        <SourceTable rows={data.ga4.sourceMedium.slice(0, spec.topN)} columns={spec.columns} shade={spec.shade} />
      </Shell>
    )
  }
  if (id === "pages" || id === "landing") {
    const topN = (settings as { topN: number }).topN
    return (
      <Shell title={title} message="">
        <PageTable rows={id === "landing" ? data.ga4.landing : data.ga4.pages} topN={topN} />
      </Shell>
    )
  }
  if (id === "gscKpi") {
    const tiles = (settings as { tiles: ("clicks" | "impressions" | "ctr" | "position")[] }).tiles
    return (
      <Shell title={title} message="">
        <Tiles data={data} tiles={tiles.map((metric) => ({ label: METRIC_LABEL[metric], metric }))} />
      </Shell>
    )
  }
  if (id === "queries") {
    const spec = settings as { mode: "all" | "brand" | "non_brand"; topN: number }
    const rows = data.gsc.queries
      .filter((row) => spec.mode === "all" || (spec.mode === "brand" ? row.brand : !row.brand))
      .slice(0, spec.topN)
    return (
      <Shell title={title} message="">
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Query</th>
                <th className="py-2 pr-3 font-medium">Clicks</th>
                <th className="py-2 pr-3 font-medium">Impressions</th>
                <th className="py-2 pr-3 font-medium">CTR</th>
                <th className="py-2 font-medium">Position</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.query} className="border-t border-border">
                  <td className="py-2 pr-3">{row.query}</td>
                  <td className="num py-2 pr-3">{NUMBER.format(row.clicks)}</td>
                  <td className="num py-2 pr-3">{NUMBER.format(row.impressions)}</td>
                  <td className="num py-2 pr-3">{row.ctr == null ? "—" : formatPercent(row.ctr * 100)}</td>
                  <td className="num py-2">{row.position == null ? "—" : POSITION.format(row.position)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Shell>
    )
  }
  if (id === "paidSpend") {
    return (
      <Shell title={title} message="">
        <p className="num mt-3 text-2xl font-semibold text-foreground">{formatMoneyCompact(data.paid.spend)}</p>
        <ul className="mt-3 space-y-1 text-sm">
          {data.paid.byChannel.map((row) => (
            <li key={row.channel} className="flex justify-between gap-4">
              <span>{row.channel}</span>
              <span className="num">{formatMoneyCompact(row.spend)}</span>
            </li>
          ))}
        </ul>
      </Shell>
    )
  }
  const events = data.ga4.current.keyEvents
  const cost = data.paid.spend != null && events != null && events > 0 ? data.paid.spend / events : null
  return (
    <Shell title={title} message="">
      <p className="num mt-3 text-2xl font-semibold text-foreground">{formatMoneyCompact(cost)}</p>
      <p className="mt-1 text-xs text-muted-foreground">AV spend divided by GA4 key events</p>
    </Shell>
  )
}

function SourceTable({
  rows,
  columns,
  shade,
}: {
  rows: SourceMediumRow[]
  columns: ("sessions" | "keyEvents" | "engagementRate")[]
  shade: boolean
}) {
  const totals = {
    sessions: rows.reduce((sum, row) => sum + row.sessions, 0),
    keyEvents: rows.reduce((sum, row) => sum + row.keyEvents, 0),
  }
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted-foreground">
            <th className="py-2 pr-3 font-medium">Source / medium</th>
            {columns.map((column) => (
              <th key={column} className="py-2 pr-3 font-medium">
                {column === "keyEvents" ? "Key events" : column === "engagementRate" ? "Engagement rate" : "Sessions"}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.source}/${row.medium}`} className="border-t border-border">
              <td className="py-2 pr-3">{row.source} / {row.medium}</td>
              {columns.map((column) => {
                const share = column === "sessions"
                  ? row.sessions / (totals.sessions || 1)
                  : column === "keyEvents"
                    ? row.keyEvents / (totals.keyEvents || 1)
                    : 0
                const text = column === "engagementRate"
                  ? row.engagementRate == null ? "—" : formatPercent(row.engagementRate * 100)
                  : NUMBER.format(column === "sessions" ? row.sessions : row.keyEvents)
                return (
                  <td key={column} className="num py-2 pr-3" style={shade ? shadeStyle(share) : undefined}>
                    {text}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
