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
  MARK_SENT_TO_FINANCE_CONFIRM,
  MARK_SENT_TO_FINANCE_COPY,
  MARK_SENT_TO_FINANCE_TITLE,
} from "@/lib/finance/markSentToFinanceCopy"

type Props = {
  disabled?: boolean
  busy?: boolean
  onConfirm: () => void | Promise<void>
  /** Trigger label. Dialog copy stays the shared mark-sent strings. */
  label?: string
  variant?: "default" | "secondary" | "outline"
}

export function MarkSentToFinanceButton({
  disabled,
  busy,
  onConfirm,
  label = MARK_SENT_TO_FINANCE_CONFIRM,
  variant = "outline",
}: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant={variant}
        disabled={disabled || busy}
        onClick={() => setOpen(true)}
      >
        {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
        {label}
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
            <AlertDialogTitle>{MARK_SENT_TO_FINANCE_TITLE}</AlertDialogTitle>
            <AlertDialogDescription>{MARK_SENT_TO_FINANCE_COPY}</AlertDialogDescription>
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
              {busy ? "Marking…" : MARK_SENT_TO_FINANCE_CONFIRM}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
