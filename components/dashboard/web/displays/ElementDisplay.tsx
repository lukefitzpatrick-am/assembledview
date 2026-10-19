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
  HorizontalBarChart,
  LineChart,
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
            <KpiTile label={tile.label} value={tile.value} caption={tile.caption} />
            {withSpark && tile.spark.length > 0 ? (
              <Sparkline data={tile.spark} color={CHART_SERIES.one} width={140} height={36} />
            ) : null}
          </div>
        ))}
      </div>
    </section>
  )
}

function useSeriesHidden(series: SeriesSpec[]) {
  const [hidden, setHidden] = useState<Set<string>>(new Set())
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
  const { legend, visible } = useSeriesHidden(series)
  const bars = visible(model.bars)
  const lines = visible(model.lines)
  const rows = model.data
  return (
    <Frame
      title={model.title}
      legend={legend}
      rows={rows}
      columns={["date", ...series.map((item) => item.key)]}
    >
      <div className={DELIVERY_CHART_CHANNEL_HEIGHT_CLASS}>
        {model.display === "line" ? (
          <LineChart data={model.data} xKey="date" series={lines} showLegend={false} />
        ) : null}
        {model.display === "area" ? (
          <AreaChart data={model.data} xKey="date" series={lines.length > 0 ? lines : bars} showLegend={false} />
        ) : null}
        {model.display === "column" ? (
          <BarChart data={model.data} xKey="date" series={bars} showLegend={false} />
        ) : null}
        {model.display === "combo" ? (
          <ComboChart
            data={model.data}
            xKey="date"
            bars={bars}
            lines={lines}
            showLegend={false}
          />
        ) : null}
      </div>
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
  if (model.kind === "series") return <SeriesBody model={model} />
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
            />
          ) : null}
          {model.display === "donut" ? (
            <DonutChart data={model.rows} valueFormat="number" />
          ) : null}
          {model.display === "treemap" ? (
            <TreemapChart data={model.rows} valueFormat="number" />
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
        <WaterfallChart steps={model.steps.map((step) => ({ label: step.label, value: step.value, kind: "delta" }))} valueFormat="number" />
      </div>
    </Frame>
  )
}
