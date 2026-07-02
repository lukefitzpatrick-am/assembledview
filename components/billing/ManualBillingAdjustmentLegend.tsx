import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  DIVERGENT_BILLING_CELL_TOOLTIP,
  MANUAL_BILLING_ADJUSTMENT_TOOLTIP,
} from "@/lib/billing/billingLineAdjustmentIndicators"

export function ManualBillingAdjustmentLegend() {
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
      <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex cursor-default items-center gap-1.5 rounded-pill border border-border bg-pacing-behind-bg px-2.5 py-1">
              <span className="h-2 w-2 shrink-0 rounded-full bg-pacing-behind" aria-hidden />
              manual adjustment
            </span>
          </TooltipTrigger>
          <TooltipContent>{MANUAL_BILLING_ADJUSTMENT_TOOLTIP}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex cursor-default items-center gap-1.5 rounded-pill border border-border px-2.5 py-1">
              <span
                className="h-px w-4 shrink-0 border-b border-dashed border-muted-foreground"
                aria-hidden
              />
              differs from calculated
            </span>
          </TooltipTrigger>
          <TooltipContent>{DIVERGENT_BILLING_CELL_TOOLTIP}</TooltipContent>
      </Tooltip>
    </div>
  )
}
