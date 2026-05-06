import { ActualsCumulativeVsTargetChart } from "@/components/dashboard/delivery/common/ActualsCumulativeVsTargetChart"
import type { TargetCurvePoint } from "@/lib/kpi/deliveryTargetCurve"
import { ProgressCard, type ProgressCardProps } from "./ProgressCard"
import { KpiBand, type KpiBandProps } from "./KpiBand"

export interface LineItemBlockProps {
  /** Line item display name. */
  name: string
  /** Optional platform pill text, e.g. "cpm" or "Meta". */
  platform?: string
  /** Two ProgressCards (spend, deliverable) for this line item. */
  progressCards: [ProgressCardProps, ProgressCardProps]
  kpiBand: KpiBandProps
  /** Cumulative-vs-target chart inputs, line-item-scoped. */
  chart: {
    targetCurve: TargetCurvePoint[]
    cumulativeActual: Array<{ date: string; actual: number }>
    asAtDate: string | null
    deliverableLabel: string
    brandColour?: string
  }
}

export function LineItemBlock({
  name,
  platform,
  progressCards,
  kpiBand,
  chart,
}: LineItemBlockProps) {
  return (
    <div className="rounded-xl border border-border/40 bg-muted/10 p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-sm font-semibold">{name}</h4>
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
      <ActualsCumulativeVsTargetChart
        targetCurve={chart.targetCurve}
        cumulativeActual={chart.cumulativeActual}
        asAtDate={chart.asAtDate}
        deliverableLabel={chart.deliverableLabel}
        brandColour={chart.brandColour}
      />
    </div>
  )
}
