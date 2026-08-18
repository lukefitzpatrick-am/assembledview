import { DeliveryPacingChart } from "@/components/dashboard/delivery/common/DeliveryPacingChart"
import type { TargetCurvePoint } from "@/lib/kpi/deliveryTargetCurve"
import { ProgressCard, type ProgressCardProps } from "./ProgressCard"
import { KpiBand, type KpiBandProps } from "./KpiBand"
import { DeliveryDailyChart, type DeliveryDailyChartSeries } from "@/components/dashboard/delivery/common/DeliveryDailyChart"
import {
  EntityBreakdownTable,
  type EntityBreakdownNoun,
  type EntityBreakdownRow,
} from "./EntityBreakdownTable"

type CumulativeChart = {
  kind: "cumulative-vs-target"
  targetCurve: TargetCurvePoint[]
  cumulativeActual: Array<{ date: string; actual: number }>
  asAtDate: string | null
  deliverableLabel: string
  brandColour?: string
}

type DailyChart = {
  kind: "daily-delivery"
  /** Daily rows. Each row has `date` plus one numeric field per series key. */
  daily: Array<Record<string, string | number>>
  /** Series to plot, in legend order. */
  series: DeliveryDailyChartSeries[]
  asAtDate: string | null
  brandColour?: string
}

export type LineItemChart = CumulativeChart | DailyChart

export interface LineItemBlockProps {
  /** Line item display name. */
  name: string
  /** Unclamped name for hover title when `name` is truncated. */
  fullName?: string
  /** Optional platform pill text, e.g. "cpm" or "Meta". */
  platform?: string
  /** Two ProgressCards (spend, deliverable) for this line item. */
  progressCards: [ProgressCardProps, ProgressCardProps]
  kpiBand: KpiBandProps
  chart: LineItemChart
  /** Delivered entity actuals (search ad groups / CM360 placements). No planned. */
  entityBreakdown?: {
    rows: EntityBreakdownRow[]
    knownPlanLineIds: string[]
    entityNoun: EntityBreakdownNoun
    columns: "spend" | "delivery"
  }
}

export function LineItemBlock({
  name,
  fullName,
  platform,
  progressCards,
  kpiBand,
  chart,
  entityBreakdown,
}: LineItemBlockProps) {
  return (
    <div className="rounded-xl border border-border/40 bg-muted/10 p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-sm font-semibold" title={fullName ?? name}>
          {name}
        </h4>
        {platform ? (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            {platform}
          </span>
        ) : null}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <ProgressCard {...progressCards[0]} dense />
        <ProgressCard {...progressCards[1]} dense />
      </div>
      <KpiBand {...kpiBand} />
      {chart.kind === "cumulative-vs-target" ? (
        <DeliveryPacingChart
          targetCurve={chart.targetCurve}
          cumulativeActual={chart.cumulativeActual}
          asAtDate={chart.asAtDate}
          deliverableLabel={chart.deliverableLabel}
          brandColour={chart.brandColour}
        />
      ) : (
        <DeliveryDailyChart
          daily={chart.daily}
          series={chart.series}
          asAtDate={chart.asAtDate}
          brandColour={chart.brandColour}
          title="Daily delivery"
          subtitle={chart.series.map((s) => s.label).join(" + ")}
        />
      )}
      {entityBreakdown && entityBreakdown.rows.length > 0 ? (
        <EntityBreakdownTable
          rows={entityBreakdown.rows}
          knownPlanLineIds={entityBreakdown.knownPlanLineIds}
          entityNoun={entityBreakdown.entityNoun}
          columns={entityBreakdown.columns}
        />
      ) : null}
    </div>
  )
}
