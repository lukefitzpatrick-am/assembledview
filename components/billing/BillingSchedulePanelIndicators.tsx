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
          variant={p.tone === "amber" ? "attention" : "secondary"}
          size="sm"
          className={cn(
            "rounded-pill font-medium",
            p.tone !== "amber" && "text-muted-foreground"
          )}
        >
          {p.label}
        </Badge>
      ))}
    </div>
  )
}

/** Amber attention dot-badge overlaid on Edit Billing when any override exists. */
export function EditBillingOverrideDot({ show }: { show: boolean }) {
  if (!show) return null
  return (
    <span
      className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-pill bg-status-attention ring-2 ring-card"
      aria-label="Billing overrides present"
      title="Billing overrides present"
    />
  )
}

/**
 * Per-month status dot. Prepay and manual are both attention (amber) —
 * prepay is no longer coded as on-track blue.
 */
export function BillingMonthStatusDot({ indicator }: { indicator?: MonthDotIndicator }) {
  if (!indicator) return null
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className="ml-1.5 inline-block h-2 w-2 shrink-0 rounded-pill align-middle bg-status-attention"
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

/** Good: quiet tick on Grand Total when billing = MBA. */
export function BillingEqualsMbaPill({
  show,
  title = "Billing totals match MBA",
}: {
  show: boolean
  title?: string
}) {
  if (!show) return null
  return (
    <Badge
      variant="good"
      size="sm"
      className="ml-2 rounded-pill font-normal"
      title={title}
    >
      ✓ = MBA
    </Badge>
  )
}

/** Blocking: Grand Total when billing ≠ MBA. */
export function BillingMismatchMbaPill({ show }: { show: boolean }) {
  if (!show) return null
  return (
    <Badge
      variant="blocking"
      size="sm"
      className="ml-2 rounded-pill font-medium"
      title="Billing totals do not match MBA"
    >
      ≠ MBA
    </Badge>
  )
}
