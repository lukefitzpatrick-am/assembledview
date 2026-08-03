"use client"

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import type { PrebillScope } from "@/lib/billing/prebillScope"

export type PrebillScopeDialogProps = {
  open: boolean
  /** Default highlighted choice (last session pick). */
  defaultScope?: PrebillScope
  onChoose: (scope: PrebillScope) => void
  onCancel: () => void
}

/**
 * MB-8 — compact Prebill scope choice (one click confirms).
 * Not a stacked wizard: Media only (default) vs Media + fee.
 */
export function PrebillScopeDialog({
  open,
  defaultScope = "media_only",
  onChoose,
  onCancel,
}: PrebillScopeDialogProps) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel()
      }}
    >
      <AlertDialogContent className="max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle>⚡ Prebill</AlertDialogTitle>
          <AlertDialogDescription>
            Move this line into the earliest billing month. Media only keeps fee on delivery
            timing (default). Media + fee also prepays the agency fee.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            type="button"
            variant={defaultScope === "media_only" ? "action" : "outline"}
            className="w-full"
            onClick={() => onChoose("media_only")}
          >
            Media only
          </Button>
          <Button
            type="button"
            variant={defaultScope === "media_and_fee" ? "action" : "outline"}
            className="w-full"
            onClick={() => onChoose("media_and_fee")}
          >
            Media + fee
          </Button>
          <AlertDialogCancel type="button" className="w-full sm:w-full">
            Cancel
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
