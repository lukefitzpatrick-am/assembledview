"use client"

/**
 * Change billing timing (billing revisions, design 6.1 and 6.2).
 * Replaces Alter billing and the inline amount edit on published plans
 * when NEXT_PUBLIC_BILLING_REVISIONS=on. Preview never writes; Confirm
 * publishes a new version through the apply route with the preview token.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/use-toast"
import {
  PANEL_TABS,
  buildPreviewGrid,
  buildRequestBody,
  centsLabel,
  initialPanelForm,
  lockTitle,
  monthShort,
  previewBlocker,
  type PanelForm,
  type PanelTab,
} from "@/lib/finance/revisions/panelModel"
import type { RevisionOk, UnderspendChoiceNeeded } from "@/lib/finance/revisions/types"
import { cn } from "@/lib/utils"

type PanelContext = {
  ok: true
  mbaNumber: string
  baseVersionNumber: number
  currentMonth: string
  campaignStartMonth: string | null
  campaignEndMonth: string | null
  months: Array<{ month: string; level: string; reasons: string[]; past: boolean; mediaCents: number }>
  approvedMonths: string[]
  lines: Array<{ lineItemId: string; label: string; isProduction: boolean; clientPaysForMedia: boolean; media: Record<string, number> }>
  workingDraftCount: number
  partial: boolean
  pacingHints: Record<string, number>
}

type Preview = {
  ok: true
  baseVersionNumber: number
  newVersionNumber: number | null
  plan: RevisionOk
  impacts: string[]
  previewToken: string
  expiresAt: string
}

type Failure = {
  code?: string
  message?: string
  error?: string
  plan?: { availableCents?: number; choicesNeeded?: UnderspendChoiceNeeded[] }
  freshPreview?: Preview
}

export type BillingRevisionPanelProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  mbaNumber: string
  initialTab?: PanelTab
  initialUnderspendMonth?: string | null
  onPublished?: () => void
  /** Test seam. */
  fetchImpl?: typeof fetch
}

export function BillingRevisionPanel({
  open,
  onOpenChange,
  mbaNumber,
  initialTab = "bill_amount",
  initialUnderspendMonth = null,
  onPublished,
  fetchImpl,
}: BillingRevisionPanelProps) {
  const doFetch = fetchImpl ?? fetch
  const [ctx, setCtx] = useState<PanelContext | null>(null)
  const [ctxError, setCtxError] = useState<string | null>(null)
  const [form, setForm] = useState<PanelForm>(() =>
    initialPanelForm({ currentMonth: "", tab: initialTab, underspendMonth: initialUnderspendMonth }),
  )
  const [preview, setPreview] = useState<Preview | null>(null)
  const [failure, setFailure] = useState<Failure | null>(null)
  const [busy, setBusy] = useState<"preview" | "apply" | null>(null)

  const underspendMonth = form.tab === "underspend" ? form.underspendMonth : ""

  useEffect(() => {
    if (!open) return
    let cancelled = false
    const qs = new URLSearchParams({ mba: mbaNumber })
    if (underspendMonth) qs.set("underspendMonth", underspendMonth)
    void (async () => {
      try {
        const res = await doFetch(`/api/finance/billing-revisions/context?${qs.toString()}`)
        const body = (await res.json().catch(() => ({}))) as PanelContext & Failure
        if (cancelled) return
        if (!res.ok) {
          setCtxError(body.message ?? body.error ?? `Load failed (${res.status})`)
          return
        }
        setCtx(body)
        setCtxError(null)
        setForm((f) => (f.intoMonth ? f : { ...f, intoMonth: body.currentMonth }))
      } catch (e) {
        if (!cancelled) setCtxError(e instanceof Error ? e.message : "Load failed")
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, mbaNumber, underspendMonth, doFetch])

  const update = useCallback((patch: Partial<PanelForm>) => {
    setForm((f) => ({ ...f, ...patch }))
    setPreview(null)
    setFailure(null)
  }, [])

  const targetMonths = useMemo(
    () => (ctx?.months ?? []).filter((m) => !m.past && !m.reasons.includes("after_campaign")),
    [ctx],
  )
  const sourceMonths = useMemo(() => targetMonths.filter((m) => m.mediaCents > 0), [targetMonths])
  const underspendMonths = useMemo(
    () => (ctx?.months ?? []).filter((m) => m.level !== "hard" && m.month <= (ctx?.currentMonth ?? "")),
    [ctx],
  )
  const underspendLines = useMemo(
    () =>
      (ctx?.lines ?? []).filter(
        (l) => !l.clientPaysForMedia && (form.includeProduction || !l.isProduction) && (l.media[form.underspendMonth] ?? 0) > 0,
      ),
    [ctx, form.includeProduction, form.underspendMonth],
  )

  const blocker = previewBlocker(form)
  const grid = useMemo(
    () => (preview && ctx ? buildPreviewGrid(preview.plan, ctx.lines) : null),
    [preview, ctx],
  )

  const runPreview = useCallback(
    async (override?: Partial<PanelForm>) => {
      const next = { ...form, ...(override ?? {}) }
      if (override) setForm(next)
      setBusy("preview")
      setFailure(null)
      setPreview(null)
      try {
        const res = await doFetch("/api/finance/billing-revisions/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildRequestBody(mbaNumber, next)),
        })
        const body = (await res.json().catch(() => ({}))) as Preview & Failure
        if (!res.ok) setFailure(body)
        else setPreview(body)
      } catch (e) {
        setFailure({ message: e instanceof Error ? e.message : "Preview failed" })
      } finally {
        setBusy(null)
      }
    },
    [form, mbaNumber, doFetch],
  )

  const runApply = useCallback(async () => {
    if (!preview) return
    setBusy("apply")
    try {
      const res = await doFetch("/api/finance/billing-revisions/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ previewToken: preview.previewToken, confirm: true }),
      })
      const body = (await res.json().catch(() => ({}))) as Failure & { status?: string; newVersionNumber?: number }
      if (!res.ok) {
        if (body.freshPreview) {
          setPreview(body.freshPreview)
          toast({ title: "The plan changed", description: "Here is a fresh preview. Check it and confirm again." })
        } else {
          setPreview(null)
          setFailure(body)
        }
        return
      }
      toast({
        title: body.status === "noted" ? "Credit noted" : `Published v${body.newVersionNumber}`,
        description: body.status === "noted" ? "Recorded in the billing change log." : "Billing timing changed. See Billing changes for the log.",
      })
      onPublished?.()
      onOpenChange(false)
    } catch (e) {
      toast({ variant: "destructive", title: "Change billing timing", description: e instanceof Error ? e.message : "Publish failed" })
    } finally {
      setBusy(null)
    }
  }, [preview, doFetch, onPublished, onOpenChange])

  const choices = failure?.code === "UNDERSPEND_NEEDS_CHOICE" ? (failure.plan?.choicesNeeded ?? []) : []
  const confirmLabel = preview
    ? preview.newVersionNumber == null
      ? "Record credit note"
      : `Publish billing revision v${preview.newVersionNumber}`
    : "Publish billing revision"

  const select = "h-9 w-full rounded-input border border-input bg-background px-2 text-sm"

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-3xl" data-billing-revision-panel="">
        <SheetHeader>
          <SheetTitle>Change billing timing</SheetTitle>
          <SheetDescription>
            {mbaNumber}
            {ctx ? ` · published v${ctx.baseVersionNumber}` : ""}. Line totals stay the same. Invoiced months never change.
          </SheetDescription>
        </SheetHeader>

        {ctxError ? (
          <p className="mt-4 text-sm text-status-critical-fg" role="alert">
            {ctxError}
          </p>
        ) : null}
        {ctx?.partial ? (
          <p className="mt-4 text-sm text-status-critical-fg">This plan has a partial MBA scope. Billing revisions do not support it yet.</p>
        ) : null}

        <div className="mt-4 space-y-4">
          <Tabs value={form.tab} onValueChange={(v) => update({ tab: v as PanelTab })}>
            <TabsList>
              {PANEL_TABS.map((t) => (
                <TabsTrigger key={t.value} value={t.value}>
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {form.tab !== "underspend" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="br-into">Bill into</Label>
                <select
                  id="br-into"
                  className={select}
                  value={form.intoMonth}
                  onChange={(e) => update({ intoMonth: e.target.value })}
                >
                  {targetMonths.map((m) => (
                    <option key={m.month} value={m.month}>
                      {monthShort(m.month)}
                      {m.level !== "open" ? ` (${lockTitle(m.reasons, m.level)})` : ""}
                    </option>
                  ))}
                </select>
              </div>
              {form.tab === "bill_amount" ? (
                <>
                  <div className="space-y-1">
                    <Label htmlFor="br-amount">Amount ($, ex GST)</Label>
                    <Input
                      id="br-amount"
                      inputMode="decimal"
                      value={form.amount}
                      onChange={(e) => update({ amount: e.target.value })}
                      placeholder="100000"
                    />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <Label htmlFor="br-strategy">Take it from</Label>
                    <select
                      id="br-strategy"
                      className={select}
                      value={form.strategy}
                      onChange={(e) => update({ strategy: e.target.value as PanelForm["strategy"] })}
                    >
                      <option value="earliest_first">Earliest months first</option>
                      <option value="proportional">Spread across all future months</option>
                    </select>
                  </div>
                </>
              ) : null}
              {form.tab === "pull_month" ? (
                <div className="space-y-1">
                  <Label htmlFor="br-from">Pull from</Label>
                  <select id="br-from" className={select} value={form.fromMonth} onChange={(e) => update({ fromMonth: e.target.value })}>
                    <option value="">Pick a month</option>
                    {sourceMonths
                      .filter((m) => m.month !== form.intoMonth)
                      .map((m) => (
                        <option key={m.month} value={m.month}>
                          {monthShort(m.month)} ({centsLabel(m.mediaCents)})
                        </option>
                      ))}
                  </select>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="br-under-month">Underspend month</Label>
                <select
                  id="br-under-month"
                  className={select}
                  value={form.underspendMonth}
                  onChange={(e) => update({ underspendMonth: e.target.value, actuals: {}, noRemaining: {} })}
                >
                  <option value="">Pick a month</option>
                  {underspendMonths.map((m) => (
                    <option key={m.month} value={m.month}>
                      {monthShort(m.month)}
                      {m.level !== "open" ? ` (${lockTitle(m.reasons, m.level)})` : ""}
                    </option>
                  ))}
                </select>
              </div>
              {form.underspendMonth ? (
                <table className="w-full text-sm" data-underspend-lines="">
                  <thead>
                    <tr className="text-left text-[11px] text-muted-foreground">
                      <th className="py-1 font-normal">Line</th>
                      <th className="py-1 font-normal">Plan</th>
                      <th className="py-1 font-normal">Actual ($)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {underspendLines.map((l) => {
                      const hint = ctx?.pacingHints[l.lineItemId]
                      return (
                        <tr key={l.lineItemId} className="border-t border-border/50">
                          <td className="py-1 pr-2">{l.label}</td>
                          <td className="num py-1 pr-2 tabular-nums">{centsLabel(l.media[form.underspendMonth] ?? 0)}</td>
                          <td className="py-1">
                            <Input
                              aria-label={`Actual for ${l.lineItemId}`}
                              inputMode="decimal"
                              value={form.actuals[l.lineItemId] ?? ""}
                              onChange={(e) => update({ actuals: { ...form.actuals, [l.lineItemId]: e.target.value } })}
                            />
                            {hint != null ? (
                              <p className="mt-0.5 text-[11px] text-muted-foreground">Pacing delivered: {centsLabel(hint)}</p>
                            ) : null}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              ) : null}
            </div>
          )}

          {ctx && ctx.approvedMonths.length > 0 ? (
            <fieldset className="space-y-1">
              <legend className="text-sm font-medium">Approved months you may change</legend>
              <p className="text-[11px] text-muted-foreground">Locked unless ticked. A ticked month needs Re-approve after publish.</p>
              <div className="flex flex-wrap gap-3">
                {ctx.approvedMonths.map((m) => (
                  <label key={m} className="flex items-center gap-1.5 text-sm">
                    <Checkbox
                      checked={form.unlockApprovedMonths.includes(m)}
                      onCheckedChange={(c) =>
                        update({
                          unlockApprovedMonths: c
                            ? [...form.unlockApprovedMonths, m].sort()
                            : form.unlockApprovedMonths.filter((x) => x !== m),
                        })
                      }
                    />
                    {monthShort(m)}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-1.5 text-sm">
              <Checkbox checked={form.includeProduction} onCheckedChange={(c) => update({ includeProduction: c === true })} />
              Include production
            </label>
            <label className="flex items-center gap-1.5 text-sm">
              <Checkbox checked={form.feeFollows} onCheckedChange={(c) => update({ feeFollows: c === true })} />
              Fee follows media
            </label>
          </div>

          <div className="space-y-1">
            <Label htmlFor="br-reason">Reason (required)</Label>
            <Textarea
              id="br-reason"
              value={form.reason}
              onChange={(e) => update({ reason: e.target.value })}
              placeholder="Why the timing changes"
              rows={2}
            />
          </div>

          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" disabled={Boolean(blocker) || busy != null || !ctx} onClick={() => void runPreview()}>
              {busy === "preview" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
              Preview
            </Button>
            {blocker ? <span className="text-[11px] text-muted-foreground">{blocker}</span> : null}
          </div>

          {failure ? (
            <div className="space-y-2 rounded-input border border-border p-3 text-sm" role="alert" data-revision-failure={failure.code ?? ""}>
              <p className="text-status-critical-fg">{failure.message ?? failure.error ?? "Preview failed"}</p>
              {failure.code === "AMOUNT_EXCEEDS_AVAILABLE" && failure.plan?.availableCents != null ? (
                <Button type="button" size="sm" variant="secondary" onClick={() => void runPreview({ tab: "bill_remainder" })}>
                  Bill the remainder ({centsLabel(failure.plan.availableCents)})
                </Button>
              ) : null}
              {choices.length > 0 ? (
                <div className="space-y-2">
                  {choices.map((c) => (
                    <div key={c.lineItemId} className="flex flex-wrap items-center gap-3">
                      <span className="min-w-0 flex-1">
                        {c.label}: {centsLabel(c.gapCents)}
                      </span>
                      <label className="flex items-center gap-1 text-[12px]">
                        <input
                          type="radio"
                          name={`choice-${c.lineItemId}`}
                          disabled={c.lastMonth == null}
                          checked={form.noRemaining[c.lineItemId] === "last_month"}
                          onChange={() => setForm((f) => ({ ...f, noRemaining: { ...f.noRemaining, [c.lineItemId]: "last_month" } }))}
                        />
                        {c.lastMonth ? `Line's last month (${monthShort(c.lastMonth)})` : "No later month"}
                      </label>
                      <label className="flex items-center gap-1 text-[12px]">
                        <input
                          type="radio"
                          name={`choice-${c.lineItemId}`}
                          checked={form.noRemaining[c.lineItemId] === "credit"}
                          onChange={() => setForm((f) => ({ ...f, noRemaining: { ...f.noRemaining, [c.lineItemId]: "credit" } }))}
                        />
                        Credit (change log note only)
                      </label>
                    </div>
                  ))}
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={choices.some((c) => !form.noRemaining[c.lineItemId])}
                    onClick={() => void runPreview()}
                  >
                    Preview with these choices
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}

          {preview && grid ? (
            <div className="space-y-3" data-revision-preview="">
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr>
                      <th className="py-1 pr-2 text-left font-normal text-muted-foreground">Line</th>
                      {grid.months.map((m) => (
                        <th
                          key={m.month}
                          title={m.title}
                          data-locked={m.locked ? "" : undefined}
                          className={cn("py-1 pr-2 text-right font-normal", m.locked ? "text-muted-foreground" : "text-foreground")}
                        >
                          {m.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {grid.rows.map((r) => (
                      <tr key={r.lineItemId} className="border-t border-border/50">
                        <td className="py-1 pr-2">
                          {r.label}
                          {r.skipped ? <span className="ml-1 text-muted-foreground">({r.skipped.replace("_", " ")}, unchanged)</span> : null}
                        </td>
                        {grid.months.map((m) => {
                          const c = r.cells[m.month]!
                          return (
                            <td
                              key={m.month}
                              data-changed={c.changed ? "" : undefined}
                              className={cn("num py-1 pr-2 text-right tabular-nums", c.changed && "bg-muted font-medium", m.locked && "text-muted-foreground")}
                            >
                              {c.changed ? `${centsLabel(c.before)} → ${centsLabel(c.after)}` : centsLabel(c.after)}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                    {grid.totals.map((t) => (
                      <tr key={t.key} className={cn("border-t border-border", t.key === "total" && "font-semibold")}>
                        <td className="py-1 pr-2">{t.label}</td>
                        {grid.months.map((m) => {
                          const c = t.cells[m.month]!
                          return (
                            <td key={m.month} className={cn("num py-1 pr-2 text-right tabular-nums", c.changed && "bg-muted")}>
                              {c.changed ? `${centsLabel(c.before)} → ${centsLabel(c.after)}` : centsLabel(c.after)}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="list-disc space-y-0.5 pl-5 text-sm" data-revision-impacts="">
                <li>Moves {centsLabel(preview.plan.movedCents)}.</li>
                {preview.impacts.map((i) => (
                  <li key={i}>{i}</li>
                ))}
                {preview.plan.warnings.map((w) => (
                  <li key={`${w.code}-${w.lineItemId ?? ""}-${w.month ?? ""}`} className="text-muted-foreground">
                    {w.message}
                  </li>
                ))}
              </ul>
              <Button type="button" disabled={busy != null || !form.reason.trim()} onClick={() => void runApply()}>
                {busy === "apply" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
                {confirmLabel}
              </Button>
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  )
}
