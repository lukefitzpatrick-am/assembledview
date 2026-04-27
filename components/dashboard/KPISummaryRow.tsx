import { SmallProgressCard } from "@/components/dashboard/delivery/SmallProgressCard"
import { cn } from "@/lib/utils"

type MetricFormat = "currency" | "number" | "percent"

export type KPISummaryMetric = {
  label: string
  value: string | number
  expected?: string | number
  pacingPct?: number
  accentColor?: string
  format?: MetricFormat
}

type KPISummaryRowProps = {
  metrics: KPISummaryMetric[]
  columns?: 2 | 3 | 4
  embedded?: boolean
}

const audCurrencyFormatter = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

const numberFormatter = new Intl.NumberFormat("en-AU")

function formatMetricValue(value: string | number, format?: MetricFormat): string {
  if (typeof value === "string") return value

  switch (format) {
    case "currency":
      return audCurrencyFormatter.format(value)
    case "percent":
      return `${value.toFixed(2)}%`
    case "number":
    default:
      return numberFormatter.format(value)
  }
}

function gridClassForColumns(columns: 2 | 3 | 4): string {
  if (columns === 2) {
    return "grid-cols-2"
  }
  if (columns === 3) {
    return "grid-cols-2 xl:grid-cols-3"
  }
  return "grid-cols-2 xl:grid-cols-4"
}

export function KPISummaryRow({ metrics, columns = 4, embedded = false }: KPISummaryRowProps) {
  return (
    <div className={cn("grid gap-3 sm:gap-4", gridClassForColumns(columns))}>
      {metrics.map((metric, index) => {
        const valueText = formatMetricValue(metric.value, metric.format)
        const expectedText =
          metric.expected !== undefined
            ? `Expected: ${formatMetricValue(metric.expected, metric.format)}`
            : undefined

        return (
          <SmallProgressCard
            key={`${metric.label}-${index}`}
            label={metric.label}
            value={valueText}
            helper={expectedText}
            pacingPct={metric.pacingPct}
            progressRatio={
              typeof metric.pacingPct === "number" && Number.isFinite(metric.pacingPct)
                ? metric.pacingPct / 100
                : 0
            }
            accentColor={metric.accentColor}
            comparisonValue={typeof metric.pacingPct === "number" ? 100 : undefined}
            comparisonLabel="Expected pace"
            embedded={embedded}
            className="h-full min-h-[170px]"
          />
        )
      })}
    </div>
  )
}

