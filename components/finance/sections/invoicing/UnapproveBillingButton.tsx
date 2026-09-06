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
import { unapproveConfirmCopy } from "@/lib/finance/sections/unapproveCopy"

type Props = {
  disabled?: boolean
  busy?: boolean
  clientName: string
  billingMonth: string
  amountDollars: number
  onConfirm: () => void | Promise<void>
}

export function UnapproveBillingButton({
  disabled,
  busy,
  clientName,
  billingMonth,
  amountDollars,
  onConfirm,
}: Props) {
  const [open, setOpen] = useState(false)
  const copy = unapproveConfirmCopy({ clientName, billingMonth, amountDollars })

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={disabled || busy}
        onClick={() => setOpen(true)}
      >
        {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
        Un-approve
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
              {busy ? "Un-approving…" : "Un-approve"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
