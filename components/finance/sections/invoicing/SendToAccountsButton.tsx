"use client"

import { useId, useState } from "react"
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
import { HelpTip } from "@/components/help/Help"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { formatAUD } from "@/lib/format/money"
import type { AbovePlanHold } from "@/lib/finance/abovePlan"
import type { AccountsPackPreview } from "@/lib/finance/sendToAccounts"
import { fromCents } from "@/lib/money"

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

type PackPreview = AccountsPackPreview & { held?: AbovePlanHold[] }

const REASON_MAX = 2000

/** S14: one invoice held above plan, with its reason form (finance admins only reach this dialog). */
function HeldAbovePlanItem({ hold, month, onReleased }: { hold: AbovePlanHold; month: string; onReleased: () => void }) {
  const id = useId()
  const [reason, setReason] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const who = `${hold.clientName || "Client"}${hold.mbaNumber ? ` (${hold.mbaNumber})` : ""}`

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch("/api/finance/billing/above-plan-reason", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, invoice_key: hold.invoiceKey, reason, seen_cents: hold.abovePlanCents }),
      })
      const body = (await res.json()) as { message?: string; error?: string }
      if (!res.ok) {
        setError(body.message || body.error || "Could not store the reason.")
        return
      }
      onReleased()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not store the reason.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <li className="space-y-1.5 rounded-md border border-border p-2">
      <p className="text-foreground">
        {who}: <span className="num">{formatAUD(fromCents(hold.abovePlanCents))}</span> above plan
      </p>
      <p className="num text-[12px] text-muted-foreground">
        This invoice {formatAUD(fromCents(hold.toBillCents))} · invoiced so far{" "}
        {formatAUD(fromCents(hold.billedTotalCents))} ({formatAUD(fromCents(hold.billedMonthCents))} this month) · plan{" "}
        {formatAUD(fromCents(hold.planTotalCents))} ({formatAUD(fromCents(hold.planMonthCents))} this month)
      </p>
      {hold.reason ? (
        <p className="text-[12px] text-muted-foreground">
          The last reason covered {formatAUD(fromCents(hold.reason.coversCents))}: {hold.reason.reason}
          {hold.reason.byName ? ` (${hold.reason.byName})` : ""}
        </p>
      ) : null}
      <form onSubmit={(e) => void submit(e)} className="space-y-1.5">
        <label htmlFor={`${id}-reason`} className="block text-[12px] font-medium text-foreground">
          Finance reason for {who}
        </label>
        <Textarea
          id={`${id}-reason`}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          required
          maxLength={REASON_MAX}
          rows={2}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        {error ? (
          <p id={`${id}-error`} role="alert" className="text-[12px] text-status-critical-fg">
            {error}
          </p>
        ) : null}
        <Button type="submit" size="sm" variant="outline" disabled={saving || reason.trim() === ""}>
          {saving ? "Saving…" : "Store reason and include"}
        </Button>
      </form>
    </li>
  )
}

export function SendToAccountsButton({ fy, month, monthLabel, disabled, onSent }: Props) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<PackPreview | null>(null)

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
      setPreview(body as PackPreview)
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
              {preview.held?.length ? (
                <section aria-labelledby="held-above-plan" className="space-y-1.5">
                  <h3 id="held-above-plan" className="flex items-center text-sm font-medium text-status-critical-fg">
                    Held above plan · {preview.held.length} not in this pack
                    <HelpTip id="abovePlanHold" label="Held above plan" />
                  </h3>
                  <ul className="max-h-64 space-y-2 overflow-y-auto text-sm">
                    {preview.held.map((hold) => (
                      <HeldAbovePlanItem key={hold.invoiceKey} hold={hold} month={month} onReleased={() => void loadPreview()} />
                    ))}
                  </ul>
                </section>
              ) : null}
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
