"use client"

import { Badge } from "@/components/ui/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import {
  billingEqualsMbaLabel,
  editBillingOverrideDotLabel,
  type BillingTimingProvenance,
} from "@/lib/billing/manualBillingVocabulary"
import type {
  BillingSchedulePanelIndicatorModel,
  MonthDotIndicator,
} from "@/lib/finance/panelIndicatorsFromCampaignFinancials"

/** Manual / Prepaid pills under the Billing Schedule title (one label per concept). */
export function BillingScheduleTitlePills({
  pills,
}: {
  pills: BillingSchedulePanelIndicatorModel["titlePills"]
}) {
  if (pills.length === 0) return null
  return (
    <TooltipProvider delayDuration={200}>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {pills.map((p) => {
          const badge = (
            <Badge
              variant={p.tone === "amber" ? "attention" : "secondary"}
              size="sm"
              className={cn(
                "rounded-pill font-medium",
                p.tone !== "amber" && "text-muted-foreground"
              )}
            >
              {p.label}
            </Badge>
          )
          if (!p.tooltip) return <span key={p.key}>{badge}</span>
          return (
            <Tooltip key={p.key}>
              <TooltipTrigger asChild>
                <span className="inline-flex">{badge}</span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs text-xs">
                {p.tooltip}
              </TooltipContent>
            </Tooltip>
          )
        })}
      </div>
    </TooltipProvider>
  )
}

/** Amber attention dot-badge overlaid on Edit Billing when any override exists. */
export function EditBillingOverrideDot({
  show,
  provenance = null,
}: {
  show: boolean
  /** MB-24: draft / unsaved / saved — drives aria-label / title. */
  provenance?: BillingTimingProvenance | null
}) {
  if (!show) return null
  const label = provenance
    ? editBillingOverrideDotLabel(provenance)
    : "Billing overrides present"
  return (
    <span
      className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-pill bg-status-attention ring-2 ring-card"
      aria-label={label}
      title={label}
    />
  )
}

/**
 * Per-month status dot. Prepay and manual are both attention (amber) —
 * hover explains the month differs from auto billing (BUX-3).
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
  title = "Billable totals match the MBA",
  hasPending = false,
}: {
  show: boolean
  title?: string
  /** MB-21: pending rows → label states schedule is unsaved (not a persistence claim). */
  hasPending?: boolean
}) {
  if (!show) return null
  const label = billingEqualsMbaLabel({ matches: true, hasPending })
  return (
    <Badge
      variant="good"
      size="sm"
      className="ml-2 rounded-pill font-normal"
      title={
        hasPending
          ? "Totals match the MBA on screen — billing timing is unsaved"
          : title
      }
    >
      {label}
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
      title="Billable totals do not match the MBA"
    >
      Doesn&apos;t match MBA
    </Badge>
  )
}
