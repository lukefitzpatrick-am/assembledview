"use client"

/**
 * Billing changes: the change log for one plan, with Undo (design 6.3).
 * Undo builds a restore preview on the server; Confirm publishes it with
 * the preview token like any other revision. Months invoiced since are
 * listed as "cannot undo".
 */

import { useCallback, useEffect, useState } from "react"
import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { toast } from "@/components/ui/use-toast"
import { summariseRevisionLog, type RevisionLogItem, type RevisionLogRowDto } from "@/lib/finance/revisions/logModel"
import { centsLabel } from "@/lib/finance/revisions/panelModel"

type UndoPreview = {
  ok: true
  newVersionNumber: number | null
  previewToken: string
  impacts: string[]
  plan: { movedCents: number; warnings: Array<{ code: string; message: string }>; cannotUndo: Array<{ lineItemId: string; months: string[] }> }
}

export type BillingRevisionLogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  mbaNumber: string
  onChanged?: () => void
  fetchImpl?: typeof fetch
}

export function BillingRevisionLog({ open, onOpenChange, mbaNumber, onChanged, fetchImpl }: BillingRevisionLogProps) {
  const doFetch = fetchImpl ?? fetch
  const [items, setItems] = useState<RevisionLogItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<number | null>(null)
  const [undo, setUndo] = useState<{ id: number; preview: UndoPreview } | null>(null)
  const [undoError, setUndoError] = useState<string | null>(null)
  const [busy, setBusy] = useState<number | "apply" | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await doFetch(`/api/finance/billing-revisions?mba=${encodeURIComponent(mbaNumber)}`)
      const body = (await res.json().catch(() => ({}))) as { revisions?: RevisionLogRowDto[]; message?: string; error?: string }
      if (!res.ok) {
        setError(body.message ?? body.error ?? `Load failed (${res.status})`)
        return
      }
      setItems(summariseRevisionLog(body.revisions ?? []))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed")
    }
  }, [doFetch, mbaNumber])

  useEffect(() => {
    if (open) void load()
  }, [open, load])

  const startUndo = useCallback(
    async (id: number) => {
      setBusy(id)
      setUndo(null)
      setUndoError(null)
      try {
        const res = await doFetch(`/api/finance/billing-revisions/${id}/undo`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        })
        const body = (await res.json().catch(() => ({}))) as UndoPreview & {
          message?: string
          plan?: { cannotUndo?: Array<{ lineItemId: string; months: string[] }> }
        }
        if (!res.ok) {
          const blocked = body.plan?.cannotUndo ?? []
          setUndoError(
            [body.message ?? "Cannot undo.", ...blocked.map((c) => `${c.lineItemId}: cannot undo ${c.months.join(", ") || "(totals changed)"}`)].join(" "),
          )
          return
        }
        setUndo({ id, preview: body })
      } finally {
        setBusy(null)
      }
    },
    [doFetch],
  )

  const confirmUndo = useCallback(async () => {
    if (!undo) return
    setBusy("apply")
    try {
      const res = await doFetch("/api/finance/billing-revisions/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ previewToken: undo.preview.previewToken, confirm: true }),
      })
      const body = (await res.json().catch(() => ({}))) as { message?: string; newVersionNumber?: number }
      if (!res.ok) {
        setUndoError(body.message ?? "Undo failed")
        return
      }
      toast({ title: `Undone as v${body.newVersionNumber}` })
      setUndo(null)
      onChanged?.()
      await load()
    } finally {
      setBusy(null)
    }
  }, [undo, doFetch, onChanged, load])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl" data-billing-revision-log="">
        <SheetHeader>
          <SheetTitle>Billing changes</SheetTitle>
          <SheetDescription>{mbaNumber}. Every billing timing change, newest first.</SheetDescription>
        </SheetHeader>
        {error ? (
          <p className="mt-4 text-sm text-status-critical-fg" role="alert">
            {error}
          </p>
        ) : null}
        {items && items.length === 0 ? <p className="mt-4 text-sm text-muted-foreground">No billing changes yet.</p> : null}
        <ul className="mt-4 space-y-3">
          {(items ?? []).map((it) => (
            <li key={it.id} className="rounded-input border border-border p-3 text-sm" data-revision-id={it.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">
                    {it.mode} · {it.versions} · {it.moved}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {it.when} · {it.who} · {it.source} · {it.status}
                  </p>
                  <p className="mt-1">{it.reason}</p>
                  {it.monthsChanged.length > 0 ? (
                    <p className="text-[11px] text-muted-foreground">Months changed: {it.monthsChanged.join(", ")}</p>
                  ) : null}
                  {it.credits.map((c) => (
                    <p key={c} className="text-[11px]">
                      {c}
                    </p>
                  ))}
                </div>
                <div className="flex gap-2">
                  {it.lines.length > 0 ? (
                    <Button type="button" size="sm" variant="ghost" onClick={() => setExpanded(expanded === it.id ? null : it.id)}>
                      {expanded === it.id ? "Hide lines" : "Lines"}
                    </Button>
                  ) : null}
                  {it.canUndo ? (
                    <Button type="button" size="sm" variant="outline" disabled={busy != null} onClick={() => void startUndo(it.id)}>
                      {busy === it.id ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
                      Undo
                    </Button>
                  ) : null}
                </div>
              </div>
              {expanded === it.id ? (
                <ul className="mt-2 space-y-1 text-[12px]">
                  {it.lines.map((l) => (
                    <li key={l.lineItemId}>
                      <span className="font-medium">{l.label}</span>: {l.cells.join("; ")}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
        {undoError ? (
          <p className="mt-3 text-sm text-status-critical-fg" role="alert" data-undo-error="">
            {undoError}
          </p>
        ) : null}
        {undo ? (
          <div className="mt-3 space-y-2 rounded-input border border-border p-3 text-sm" data-undo-preview="">
            <p className="font-medium">Undo moves {centsLabel(undo.preview.plan.movedCents)} back.</p>
            <ul className="list-disc pl-5">
              {undo.preview.impacts.map((i) => (
                <li key={i}>{i}</li>
              ))}
              {undo.preview.plan.warnings.map((w) => (
                <li key={`${w.code}-${w.message}`} className="text-muted-foreground">
                  {w.message}
                </li>
              ))}
            </ul>
            <Button type="button" size="sm" disabled={busy != null} onClick={() => void confirmUndo()}>
              {busy === "apply" ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
              Publish undo v{undo.preview.newVersionNumber}
            </Button>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
