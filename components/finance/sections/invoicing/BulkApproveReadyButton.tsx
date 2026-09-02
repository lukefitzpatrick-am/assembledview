"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"
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
import { Button } from "@/components/ui/button"
import {
  invoicingBulkApproveButtonLabel,
  invoicingBulkApproveConfirmCopy,
} from "@/lib/finance/sections/invoicingBulkApproveCopy"

type Props = {
  count: number
  amountDollars: number
  monthLabel: string
  busy?: boolean
  onConfirm: () => void | Promise<void>
}

export function BulkApproveReadyButton({
  count,
  amountDollars,
  monthLabel,
  busy,
  onConfirm,
}: Props) {
  const [open, setOpen] = useState(false)
  const copy = invoicingBulkApproveConfirmCopy({ count, amountDollars, monthLabel })
  const disabled = busy || count === 0

  return (
    <>
      <Button
        type="button"
        size="sm"
        disabled={disabled}
        onClick={() => {
          if (disabled) return
          setOpen(true)
        }}
      >
        {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
        {invoicingBulkApproveButtonLabel(count)}
      </Button>
      <AlertDialog
        open={open}
        onOpenChange={(next) => {
          if (busy) return
          setOpen(next)
        }}
      >
        <AlertDialogContent layer="nested">
          <AlertDialogHeader>
            <AlertDialogTitle>{copy.title}</AlertDialogTitle>
            <AlertDialogDescription>{copy.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault()
                if (busy) return
                void Promise.resolve(onConfirm()).finally(() => setOpen(false))
              }}
            >
              {busy ? "Approving…" : copy.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
