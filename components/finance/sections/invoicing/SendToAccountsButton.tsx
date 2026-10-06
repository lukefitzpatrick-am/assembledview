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
import { formatAUD } from "@/lib/format/money"
import type { AccountsPackPreview } from "@/lib/finance/sendToAccounts"

type Props = {
  fy: number
  month: string
  monthLabel: string
  disabled?: boolean
  onSent: () => void
}

const TYPE_LABEL: Record<string, string> = {
  media: "Media",
  sow: "Scopes",
  retainer: "Retainers",
}

export function SendToAccountsButton({ fy, month, monthLabel, disabled, onSent }: Props) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<AccountsPackPreview | null>(null)

  const loadPreview = async () => {
    setLoading(true)
    setError(null)
    setPreview(null)
    try {
      const res = await fetch(
        `/api/finance/send-to-accounts?preview=1&fy=${fy}&month=${encodeURIComponent(month)}`
      )
      const body = (await res.json()) as { message?: string; error?: string } & Partial<AccountsPackPreview>
      if (!res.ok) {
        setError(body.message || body.error || "Could not preview the pack.")
        return
      }
      setPreview(body as AccountsPackPreview)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not preview the pack.")
    } finally {
      setLoading(false)
    }
  }

  const send = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/finance/send-to-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fy, month }),
      })
      const body = (await res.json()) as { message?: string; error?: string; sent?: number }
      if (!res.ok) {
        setError(body.message || body.error || "Could not send the pack.")
        return
      }
      setOpen(false)
      onSent()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send the pack.")
    } finally {
      setBusy(false)
    }
  }

  const count = preview?.invoiceCount ?? 0

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={disabled}
        onClick={() => {
          setOpen(true)
          void loadPreview()
        }}
      >
        Send to accounts
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
            <AlertDialogTitle>Send {monthLabel} to accounts</AlertDialogTitle>
            <AlertDialogDescription>
              Approved invoices that have not been sent yet. Already-exported rows stay as they are.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {loading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              Loading preview
            </p>
          ) : null}
          {error ? <p className="text-sm text-status-critical-fg">{error}</p> : null}
          {preview ? (
            <div className="space-y-2 text-sm">
              <p className="num text-foreground">
                {count} {count === 1 ? "invoice" : "invoices"} · {formatAUD(preview.totalExGst)} ex-GST
              </p>
              <ul className="space-y-0.5 text-muted-foreground">
                {(["media", "sow", "retainer"] as const).map((type) => (
                  <li key={type} className="num">
                    {TYPE_LABEL[type]} · {preview.totalsByType[type].count} ·{" "}
                    {formatAUD(preview.totalsByType[type].total)}
                  </li>
                ))}
              </ul>
              {preview.blockers.length > 0 ? (
                <ul className="space-y-0.5 text-[12px] text-status-critical-fg">
                  {preview.blockers.map((row) => (
                    <li key={row.invoiceKey}>
                      {row.clientName || "Client"}
                      {row.mbaNumber ? ` (${row.mbaNumber})` : ""}: {row.blockers.join("; ")}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy || loading || count === 0 || Boolean(error)}
              onClick={(e) => {
                e.preventDefault()
                void send()
              }}
            >
              {busy ? "Sending…" : "Send to accounts"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
