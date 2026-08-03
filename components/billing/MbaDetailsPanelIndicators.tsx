"use client"

import { Badge } from "@/components/ui/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  MANUAL_BILLING_VOCAB,
  clientPaysBadgeLabel,
  feeAdjustedBadgeLabel,
  formatManualBillingStatusLabel,
  manualTimingBadgeLabel,
  prebillBadgeTooltip,
  prebillStatusLabelFromFlags,
  provenanceTooltip,
} from "@/lib/billing/manualBillingVocabulary"
import { cn } from "@/lib/utils"
import type { MediaTypeRowIndicators } from "@/lib/finance/panelIndicatorsFromCampaignFinancials"

function ExplainedBadge({
  label,
  tooltip,
  variant,
  className,
  dot,
}: {
  label: string
  tooltip: string
  variant: "attention" | "secondary" | "good" | "blocking"
  className?: string
  dot?: boolean
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">
          <Badge variant={variant} size="sm" dot={dot} className={className}>
            {label}
          </Badge>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  )
}

/** Attention: amber partial-scope badge for the MBA Details header. */
export function MbaPartialScopePill({ label }: { label: string | null }) {
  if (!label) return null
  return (
    <Badge variant="attention" size="sm" className="rounded-pill font-medium">
      {label}
    </Badge>
  )
}

/** Per media-type row status pills — MB-9 vocabulary + MB-21 saved/unsaved axis. */
export function MbaMediaTypeRowPills({ row }: { row?: MediaTypeRowIndicators }) {
  if (!row) return null
  const prebillBase = prebillStatusLabelFromFlags({
    prepaid: row.prepaid,
    mediaPrepaid: row.mediaPrepaid,
  })
  const provenance = row.timingProvenance ?? null
  const differs = Boolean(row.differsFromSaved)
  const annotate = (base: string) => {
    if (!provenance) return base
    return formatManualBillingStatusLabel(
      base === MANUAL_BILLING_VOCAB.prepaidMediaAndFee
        ? "prepaidMediaAndFee"
        : base === MANUAL_BILLING_VOCAB.prepaidMedia
          ? "prepaidMedia"
          : base === MANUAL_BILLING_VOCAB.manualTiming
            ? "manualTiming"
            : base === MANUAL_BILLING_VOCAB.feeAdjusted
              ? "feeAdjusted"
              : "clientPays",
      provenance,
      { differsFromSaved: differs }
    )
  }
  const prebillLabel = prebillBase
    ? provenance
      ? annotate(prebillBase)
      : prebillBase
    : null
  const prebillTooltip = prebillBase
    ? provenance
      ? provenanceTooltip(provenance, { differsFromSaved: differs })
      : prebillBadgeTooltip(prebillBase)
    : ""
  return (
    <TooltipProvider delayDuration={200}>
      <span className="ml-2 inline-flex flex-wrap items-center gap-1">
        {row.notInMba ? (
          <Badge
            variant="secondary"
            size="sm"
            className="rounded-pill font-normal text-muted-foreground"
          >
            Not in MBA
          </Badge>
        ) : null}
        {prebillLabel ? (
          <ExplainedBadge
            label={prebillLabel}
            variant="attention"
            className="rounded-pill font-medium"
            tooltip={prebillTooltip}
          />
        ) : null}
        {row.manual && !prebillLabel ? (
          <ExplainedBadge
            label={
              provenance
                ? formatManualBillingStatusLabel("manualTiming", provenance, {
                    differsFromSaved: differs,
                  })
                : manualTimingBadgeLabel()
            }
            variant="attention"
            className="rounded-pill font-medium"
            tooltip={
              provenance
                ? provenanceTooltip(provenance, { differsFromSaved: differs })
                : "Billing months were set manually and may differ from auto-calculated delivery timing for invoicing."
            }
          />
        ) : null}
        {row.feeAdjusted ? (
          <ExplainedBadge
            label={
              provenance
                ? formatManualBillingStatusLabel("feeAdjusted", provenance)
                : feeAdjustedBadgeLabel()
            }
            variant="attention"
            className="rounded-pill font-medium"
            tooltip="Fee months were adjusted manually for invoicing."
          />
        ) : null}
        {row.clientPays && !row.notInMba ? (
          <ExplainedBadge
            label={clientPaysBadgeLabel()}
            variant="attention"
            className="rounded-pill font-medium"
            tooltip="Client pays media cost directly; it is excluded from billable MBA totals."
          />
        ) : null}
      </span>
    </TooltipProvider>
  )
}

/** Quiet tick beside Total Investment when billable = MBA (good). */
export function MbaBillableEqualsPill({ show }: { show: boolean }) {
  if (!show) return null
  return (
    <Badge
      variant="good"
      size="sm"
      className="ml-2 rounded-pill font-normal"
      title="Billable totals match billing"
    >
      Matches billing
    </Badge>
  )
}

/** Blocking pill when billable ≠ MBA. */
export function MbaBillableMismatchPill({ show }: { show: boolean }) {
  if (!show) return null
  return (
    <Badge
      variant="blocking"
      size="sm"
      className="ml-2 rounded-pill font-medium"
      title="Billable totals do not match billing"
    >
      Doesn&apos;t match billing
    </Badge>
  )
}

/** Attention: campaign-level fee-adjusted hint on the Assembled Fee label. */
export function MbaFeeAdjustedPill({ show }: { show: boolean }) {
  if (!show) return null
  return (
    <TooltipProvider delayDuration={200}>
      <ExplainedBadge
        label={MANUAL_BILLING_VOCAB.feeAdjusted}
        variant="attention"
        className="ml-2 rounded-pill font-medium"
        tooltip="Campaign fee total was adjusted manually for invoicing."
      />
    </TooltipProvider>
  )
}

export function mbaMediaTypeRowClassName(row?: MediaTypeRowIndicators): string {
  return cn(row?.muted && "opacity-50 text-muted-foreground")
}
