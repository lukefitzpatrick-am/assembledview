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
import type { StaleDateBasisOverride } from "@/lib/finance/preservePriorBilling"

type Props = {
  open: boolean
  stale: StaleDateBasisOverride[]
  onKeep: () => void
  onReset: () => void
  onCancel: () => void
}

/**
 * C3 prompt when an override's dateBasis no longer matches the line's current burst dates.
 * Keep = leave override months (prepayment/terms) as set; refresh basis on apply.
 * Reset = reset_line then recompute fresh schedule for those lines.
 */
export function DateBasisKeepResetDialog({ open, stale, onKeep, onReset, onCancel }: Props) {
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
                whether to keep the amounts as entered or reset to the new schedule.
              </p>
              {uniqueLabels.length > 0 ? (
                <ul className="list-disc space-y-1 pl-5 text-foreground">
                  {uniqueLabels.map((label) => (
                    <li key={label}>{label}</li>
                  ))}
                </ul>
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
