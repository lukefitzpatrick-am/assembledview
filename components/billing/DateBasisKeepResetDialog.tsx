"use client"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { buttonVariants } from "@/components/ui/button"
import { isPlanCBalancerEnabled } from "@/lib/finance/planCBalancerFlag"
import { formatAUD } from "@/lib/format/money"
import type { StaleDateBasisOverride } from "@/lib/finance/preservePriorBilling"

type Props = {
  open: boolean
  stale: StaleDateBasisOverride[]
  onKeep: () => void
  onReset: () => void
  onCancel: () => void
  /** Plan C S2b — third option when balancer flag is on. */
  onKeepShapePlusDelta?: () => void
  keepShapePlusDeltaPreview?: Array<{ month: string; amount: number }>
  /** Test override for NEXT_PUBLIC_PLANC_BALANCER. */
  balancerEnabled?: boolean
}

/**
 * C3 prompt when an override's dateBasis no longer matches the line's current burst dates.
 * Keep = leave override months (prepayment/terms) as set; refresh basis on apply.
 * Reset = reset_line then recompute fresh schedule for those lines.
 * Keep shape + delta (flag on) = preserve manual months; residual on balancer month.
 */
export function DateBasisKeepResetDialog({
  open,
  stale,
  onKeep,
  onReset,
  onCancel,
  onKeepShapePlusDelta,
  keepShapePlusDeltaPreview,
  balancerEnabled: balancerEnabledProp,
}: Props) {
  const balancerOn =
    balancerEnabledProp !== undefined
      ? balancerEnabledProp
      : isPlanCBalancerEnabled()
  const lines = stale.map((s) => {
    const reason = s.reason ? ` (${s.reason.replace(/_/g, " ")})` : ""
    return `${s.label}${reason}`
  })
  const uniqueLabels = [...new Set(lines)]

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Billing dates changed</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                One or more manual billing overrides were set against different burst dates. Choose
                whether to keep the amounts as entered or reset to the new schedule
                {balancerOn && onKeepShapePlusDelta
                  ? ", or keep the month shape and put any delta on the balancer month"
                  : ""}
                .
              </p>
              {uniqueLabels.length > 0 ? (
                <ul className="list-disc space-y-1 pl-5 text-foreground">
                  {uniqueLabels.map((label) => (
                    <li key={label}>{label}</li>
                  ))}
                </ul>
              ) : null}
              {balancerOn &&
              keepShapePlusDeltaPreview &&
              keepShapePlusDeltaPreview.length > 0 ? (
                <div className="rounded-input border border-border bg-card px-3 py-2 text-foreground">
                  <p className="text-xs font-medium">Keep shape + delta preview</p>
                  <ul className="mt-1 space-y-0.5 text-xs">
                    {keepShapePlusDeltaPreview.map((m) => (
                      <li key={m.month} className="flex justify-between gap-2">
                        <span>{m.month}</span>
                        <span className="num">{formatAUD(m.amount)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
          <AlertDialogCancel
            type="button"
            onClick={(e) => {
              e.preventDefault()
              onCancel()
            }}
          >
            Cancel save
          </AlertDialogCancel>
          <AlertDialogAction
            type="button"
            className={buttonVariants({ variant: "outline" })}
            onClick={(e) => {
              e.preventDefault()
              onKeep()
            }}
          >
            Keep the prepayment as set
          </AlertDialogAction>
          {balancerOn && onKeepShapePlusDelta ? (
            <AlertDialogAction
              type="button"
              className={buttonVariants({ variant: "outline" })}
              onClick={(e) => {
                e.preventDefault()
                onKeepShapePlusDelta()
              }}
            >
              Keep shape + delta
            </AlertDialogAction>
          ) : null}
          <AlertDialogAction
            type="button"
            onClick={(e) => {
              e.preventDefault()
              onReset()
            }}
          >
            Reset to the new schedule
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
