"use client"

import { useState, type ReactNode } from "react"

import {
  AreaChart,
  BarChart,
  BaseChartCard,
  BulletChart,
  CalendarHeatmap,
  ComboChart,
  DonutChart,
  Histogram,
  HorizontalBarChart,
  LineChart,
  ScatterChart,
  Sparkline,
  ToggleableLegend,
  TreemapChart,
  WaterfallChart,
} from "@/components/charts/system"
import { KpiTile } from "@/components/dashboard/delivery/shared/KpiTile"
import { DELIVERY_CHART_CHANNEL_HEIGHT_CLASS } from "@/components/dashboard/delivery/common/deliveryChartSpec"
import {
  CHART_SERIES,
  type PreparedDisplay,
  type PreparedTile,
  type SeriesSpec,
} from "@/lib/webReport/displayModel"

function exportRows(headers: string[], rows: { cells: { text: string }[] }[]) {
  return rows.map((row) => {
    const record: Record<string, string> = {}
    headers.forEach((header, index) => {
      record[header] = row.cells[index]?.text ?? ""
    })
    return record
  })
}

function Frame({
  title,
  note,
  rows,
  columns,
  legend,
  children,
}: {
  title: string
  note?: string
  rows?: Record<string, unknown>[]
  columns?: string[]
  legend?: ReactNode
  children: ReactNode
}) {
  return (
    <BaseChartCard
      title={title}
      subtitle={note}
      exportPage="web-report"
      exportTitle={title}
      exportSeries={rows && rows.length > 0 ? { rows, columns } : undefined}
      legend={legend}
      className="h-full"
    >
      {children}
    </BaseChartCard>
  )
}

function TileGrid({ title, tiles, withSpark }: { title: string; tiles: PreparedTile[]; withSpark: boolean }) {
  return (
    <section className="h-full rounded-card border border-border bg-card p-4 shadow-e1">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
        {tiles.map((tile) => (
          <div key={tile.label} className="min-w-0">
            <KpiTile
              label={tile.label}
              value={tile.value}
              caption={tile.caption}
              expected={tile.expected}
              status={tile.status}
              progress={tile.progress}
            />
            {withSpark && tile.spark.length > 0 ? (
              <Sparkline data={tile.spark} color={CHART_SERIES.one} width={140} height={36} />
            ) : null}
          </div>
        ))}
      </div>
    </section>
  )
}

function useSeriesHidden(series: SeriesSpec[], hiddenByDefault?: readonly string[]) {
  const [hidden, setHidden] = useState<Set<string>>(() => new Set(hiddenByDefault))
  const items = series.map((item) => ({ key: item.key, label: item.label, color: item.color }))
  const visible = (list: SeriesSpec[]) => list.filter((item) => !hidden.has(item.key))
  const legend = items.length > 0 ? (
    <ToggleableLegend
      items={items}
      hidden={hidden}
      onToggle={(key) => {
        setHidden((current) => {
          const next = new Set(current)
          if (next.has(key)) next.delete(key)
          else next.add(key)
          return next
        })
      }}
    />
  ) : null
  return { legend, visible }
}

function SeriesBody({ model }: { model: Extract<PreparedDisplay, { kind: "series" }> }) {
  const series = [...model.bars, ...model.lines]
  const { legend, visible } = useSeriesHidden(series, model.hiddenByDefault)
  const bars = visible(model.bars)
  const lines = visible(model.lines)
  const rows = model.data
  return (
    <Frame
      title={model.title}
      note={model.note}
      legend={legend}
      rows={rows}
      columns={["date", ...series.map((item) => item.key)]}
    >
      <div className={DELIVERY_CHART_CHANNEL_HEIGHT_CLASS}>
        {model.display === "line" ? (
          <LineChart data={model.data} xKey="date" series={lines} showLegend={false} className={CHART_FILL} />
        ) : null}
        {model.display === "area" ? (
          <AreaChart data={model.data} xKey="date" series={lines.length > 0 ? lines : bars} showLegend={false} className={CHART_FILL} />
        ) : null}
        {model.display === "column" ? (
          <BarChart data={model.data} xKey="date" series={bars} showLegend={false} className={CHART_FILL} />
        ) : null}
        {model.display === "combo" ? (
          <ComboChart
            data={model.data}
            xKey="date"
            bars={bars}
            lines={lines}
            sharedAxis={model.sharedAxis}
            showLegend={false}
            className={CHART_FILL}
          />
        ) : null}
      </div>
    </Frame>
  )
}

const CHART_FILL = "aspect-auto h-full w-full"

const NUMBER = new Intl.NumberFormat("en-AU", { maximumFractionDigits: 0 })
const ONE_DP = new Intl.NumberFormat("en-AU", { minimumFractionDigits: 1, maximumFractionDigits: 1 })

const BRAND_SPLIT: SeriesSpec[] = [
  { key: "nonBrand", label: "Non-brand", color: CHART_SERIES.one },
  { key: "brand", label: "Brand", color: CHART_SERIES.two },
]

function BubbleBody({ model }: { model: Extract<PreparedDisplay, { kind: "bubble" }> }) {
  const { legend, visible } = useSeriesHidden(BRAND_SPLIT)
  const shown = new Set(visible(BRAND_SPLIT).map((item) => item.key))
  const points = model.points
    .filter((point) => shown.has(point.brand ? "brand" : "nonBrand"))
    .map((point) => ({
      id: point.query,
      label: point.query,
      x: point.x,
      y: point.y,
      z: point.z,
      color: point.brand ? CHART_SERIES.two : CHART_SERIES.one,
      detail: [
        `Clicks ${NUMBER.format(point.clicks)}`,
        `Impressions ${NUMBER.format(point.impressions)}`,
        `CTR ${ONE_DP.format(point.y)}%`,
        `Position ${ONE_DP.format(point.x)}`,
      ],
    }))
  const rows = model.points.map((point) => ({
    query: point.query,
    brand: point.brand ? "Brand" : "Non-brand",
    clicks: point.clicks,
    impressions: point.impressions,
    ctr: Number(point.y.toFixed(2)),
    position: Number(point.x.toFixed(1)),
  }))
  return (
    <Frame
      title={model.title}
      note={model.note}
      legend={legend}
      rows={rows}
      columns={["query", "brand", "clicks", "impressions", "ctr", "position"]}
    >
      <div className={DELIVERY_CHART_CHANNEL_HEIGHT_CLASS}>
        <ScatterChart
          data={points}
          xLabel="Position"
          yLabel="CTR"
          yFormat="percent"
          xFormat="number"
          xReversed
          className={CHART_FILL}
        />
      </div>
    </Frame>
  )
}

function HistogramBody({ model }: { model: Extract<PreparedDisplay, { kind: "histogram" }> }) {
  return (
    <Frame title={model.title} note={model.note} rows={model.buckets} columns={["bucket", "queries", "clicks"]}>
      <div className={DELIVERY_CHART_CHANNEL_HEIGHT_CLASS}>
        <Histogram
          data={model.buckets}
          xKey="bucket"
          valueKey="queries"
          valueLabel="Queries"
          color={CHART_SERIES.one}
          xLabel="Average position"
          className={CHART_FILL}
        />
      </div>
      <dl className="mt-3 grid grid-cols-5 gap-2 text-xs">
        {model.buckets.map((bucket) => (
          <div key={bucket.bucket} className="min-w-0">
            <dt className="text-muted-foreground">{bucket.bucket}</dt>
            <dd className="num text-foreground">{NUMBER.format(bucket.clicks)} clicks</dd>
          </div>
        ))}
      </dl>
    </Frame>
  )
}

export function ElementDisplay({ model }: { model: PreparedDisplay }) {
  if (model.kind === "message") {
    return (
      <Frame title={model.title}>
        <p className="text-sm text-muted-foreground">{model.message}</p>
      </Frame>
    )
  }
  if (model.kind === "text") {
    return (
      <section className="h-full rounded-card border border-border bg-card p-4 shadow-e1">
        <h2 className="text-sm font-semibold text-foreground">{model.title}</h2>
        <p className="mt-3 whitespace-pre-wrap text-sm text-foreground">{model.text}</p>
      </section>
    )
  }
  if (model.kind === "tiles") {
    return <TileGrid title={model.title} tiles={model.tiles} withSpark={model.withSpark} />
  }
  if (model.kind === "bullet") {
    return (
      <Frame title={model.title}>
        {model.rows.length > 0 ? <BulletChart rows={model.rows.map((row) => ({ ...row }))} /> : null}
        {model.plain.length > 0 ? <TileGrid title="Without a target" tiles={model.plain} withSpark={false} /> : null}
      </Frame>
    )
  }
  if (model.kind === "series") return <SeriesBody key={model.display} model={model} />
  if (model.kind === "bubble") return <BubbleBody model={model} />
  if (model.kind === "histogram") return <HistogramBody model={model} />
  if (model.kind === "calendar") {
    const rows = model.cells.map((cell) => ({ week: cell.week, day: cell.day, value: cell.value }))
    return (
      <Frame title={model.title} rows={rows} columns={["week", "day", "value"]}>
        <CalendarHeatmap weeks={model.weeks} cells={model.cells} />
      </Frame>
    )
  }
  if (model.kind === "table") {
    return (
      <Frame title={model.title} note={model.note} rows={exportRows(model.headers, model.rows)} columns={model.headers}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                {model.headers.map((header) => (
                  <th key={header} className="py-2 pr-3 font-medium">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {model.rows.map((row) => (
                <tr key={row.key} className="border-t border-border">
                  {row.cells.map((cell, index) => (
                    <td
                      key={`${row.key}-${index}`}
                      className={index === 0 ? "max-w-[280px] truncate py-2 pr-3" : "num py-2 pr-3"}
                      style={cell.shade != null ? { backgroundColor: `color-mix(in srgb, var(--pacing-ahead) ${Math.round(cell.shade * 28)}%, transparent)` } : undefined}
                    >
                      {cell.text}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Frame>
    )
  }
  if (model.kind === "ranked") {
    const rows = model.rows.map((row) => ({ label: row.label, value: row.value }))
    return (
      <Frame title={model.title} note={model.note} rows={rows} columns={["label", "value"]}>
        <div className={DELIVERY_CHART_CHANNEL_HEIGHT_CLASS}>
          {model.display === "bar" ? (
            <HorizontalBarChart
              data={rows}
              xKey="label"
              series={[{ key: "value", label: model.valueLabel, color: CHART_SERIES.one }]}
              showLegend={false}
              className={CHART_FILL}
            />
          ) : null}
          {model.display === "donut" ? (
            <DonutChart data={model.rows} valueFormat="number" className={CHART_FILL} />
          ) : null}
          {model.display === "treemap" ? (
            <TreemapChart data={model.rows} valueFormat="number" className={CHART_FILL} />
          ) : null}
        </div>
      </Frame>
    )
  }
  return (
    <Frame
      title={model.title}
      rows={model.steps.map((step) => ({ label: step.label, value: step.value }))}
      columns={["label", "value"]}
    >
      <div className={DELIVERY_CHART_CHANNEL_HEIGHT_CLASS}>
        <WaterfallChart steps={model.steps.map((step) => ({ label: step.label, value: step.value, kind: "delta" }))} valueFormat="number" className={CHART_FILL} />
      </div>
    </Frame>
  )
}
