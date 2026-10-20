import { cn } from "@/lib/utils"
import { Sparkline } from "@/components/charts/system"
import { reshapeSparkline } from "@/components/dashboard/dashboardChartReshape"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { StatusPill } from "./StatusPill"
import { VarianceRibbon } from "./VarianceRibbon"
import { statusBg, type DeliveryStatus } from "./statusColours"

export interface ProgressCardProps {
  title: string
  /** Hover copy for the title (e.g. modelled-spend explanation). */
  titleTooltip?: string
  /** Big number, already formatted (e.g. "$35,763.47"). */
  value: string
  /** Subtext, e.g. "Delivered $35,763.47 · Expected $40,000.00 to date · $70,093.00 planned in total". */
  detail: string
  /** Progress 0..1 (delivered ÷ expected for the selected window). Clamped internally. */
  progress: number
  /** Delivered ÷ expected × 100. When set, the % figure shows it unclamped. */
  pct?: number
  /** Expected for the selected window, in the card's unit. Read by channel coverage. */
  expected?: number
  /** Expected from campaign start to Melbourne yesterday, ignoring any date filter. */
  expectedToDate?: number
  /** Whole-line planned total, in the card's unit. Information only. */
  plannedTotal?: number
  /** Variance vs expected as a decimal, e.g. -0.3923. */
  variance: number
  varianceLabel?: string
  status: DeliveryStatus
  /** Optional sparkline points (numeric series). */
  sparkline?: number[]
  /** Optional dense mode for line-item scope. */
  dense?: boolean
  className?: string
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0
  return Math.max(0, Math.min(1, n))
}

export function ProgressCard({
  title,
  titleTooltip,
  value,
  detail,
  progress,
  pct,
  variance,
  varianceLabel = "vs expected to date",
  status,
  sparkline,
  dense = false,
  className,
}: ProgressCardProps) {
  const p = clamp01(progress)
  const titleEl = (
    <p className={cn("text-sm text-muted-foreground", dense && "text-xs")}>{title}</p>
  )
  return (
    <div
      className={cn(
        "rounded-xl border border-border/60 bg-card p-4",
        dense && "p-3",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {titleTooltip ? (
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex min-w-0 cursor-help">{titleEl}</span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">{titleTooltip}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              titleEl
            )}
            <StatusPill status={status} />
          </div>
          <p
            className={cn(
              "mt-1 font-semibold tabular-nums tracking-tight",
              dense ? "text-xl" : "text-2xl",
            )}
          >
            {value}
          </p>
          <p className={cn("mt-1 text-xs text-muted-foreground", dense && "text-[11px]")}>
            {detail}
          </p>
        </div>
        <span
          className={cn(
            "tabular-nums text-sm font-medium",
            dense && "text-xs",
          )}
        >
          {(typeof pct === "number" && Number.isFinite(pct) ? pct : p * 100).toFixed(1)}%
        </span>
      </div>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-[width]", statusBg[status])}
          style={{ width: `${p * 100}%` }}
        />
      </div>
      {sparkline && sparkline.length > 0 ? (
        <div className="mt-2 h-8 w-full">
          <Sparkline
            data={reshapeSparkline(sparkline)}
            dataKey="value"
            color="var(--primary)"
            width={120}
            height={32}
          />
        </div>
      ) : null}
      <VarianceRibbon variance={variance} label={varianceLabel} className="mt-2" />
    </div>
  )
}
