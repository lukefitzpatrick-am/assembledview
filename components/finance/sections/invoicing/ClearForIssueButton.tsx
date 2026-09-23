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

type Props = {
  month: string
  monthLabel: string
  disabled?: boolean
  onSent: () => void
}

export function ClearForIssueButton({ month, monthLabel, disabled, onSent }: Props) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function send() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/finance/clear-for-issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month }),
      })
      const body = (await res.json().catch(() => null)) as { message?: string } | null
      if (!res.ok) {
        setError(body?.message ?? "Could not send the clearance email.")
        return
      }
      setOpen(false)
      onSent()
    } catch {
      setError("Could not send the clearance email.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || busy}
        onClick={() => {
          setError(null)
          setOpen(true)
        }}
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
        Clear for issue
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
            <AlertDialogTitle>Clear {monthLabel} for issue</AlertDialogTitle>
            <AlertDialogDescription>
              Emails the clearance report now, even when the draft set has not changed since the last send.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error ? <p className="text-sm text-status-critical-fg">{error}</p> : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={(event) => {
              event.preventDefault()
              void send()
            }}>
              {busy ? "Sending" : "Send clearance"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
