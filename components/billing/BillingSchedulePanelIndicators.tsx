"use client"

import { Badge } from "@/components/ui/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type {
  BillingSchedulePanelIndicatorModel,
  MonthDotIndicator,
} from "@/lib/finance/panelIndicatorsFromCampaignFinancials"

/** Manual-count + prepay-reason pills under the Billing Schedule title. */
export function BillingScheduleTitlePills({
  pills,
}: {
  pills: BillingSchedulePanelIndicatorModel["titlePills"]
}) {
  if (pills.length === 0) return null
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      {pills.map((p) => (
        <Badge
          key={p.key}
          variant={p.tone === "amber" ? "warning" : "secondary"}
          size="sm"
          className="rounded-pill font-medium"
        >
          {p.label}
        </Badge>
      ))}
    </div>
  )
}

/** Amber dot-badge overlaid on Edit Billing when any override exists. */
export function EditBillingOverrideDot({ show }: { show: boolean }) {
  if (!show) return null
  return (
    <span
      className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-pill bg-pacing-behind ring-2 ring-card"
      aria-label="Billing overrides present"
      title="Billing overrides present"
    />
  )
}

/** Per-month blue (prepay) / amber (manual) status dot with calc→set hover. */
export function BillingMonthStatusDot({ indicator }: { indicator?: MonthDotIndicator }) {
  if (!indicator) return null
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "ml-1.5 inline-block h-2 w-2 shrink-0 rounded-pill align-middle",
              indicator.tone === "prepay" ? "bg-pacing-on-track" : "bg-pacing-behind"
            )}
            aria-label={indicator.hover}
          />
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          {indicator.hover}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

/** Quiet tick on Grand Total when billing = MBA. */
export function BillingEqualsMbaPill({ show }: { show: boolean }) {
  if (!show) return null
  return (
    <Badge
      variant="secondary"
      size="sm"
      className="ml-2 rounded-pill font-normal text-muted-foreground"
      title="Billing totals match MBA"
    >
      ✓ = MBA
    </Badge>
  )
}
