"use client"

/**
 * True-up fixes for one MBA (Stage 2, TRUE_UP_ACTIONS). Preview never
 * writes; Confirm publishes a new plan version through /api/finance/true-up/apply
 * with the preview token and records the ledger. Explained, one-off and
 * credit-note entries never change a schedule.
 */

import { useState } from "react"
import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/use-toast"
import { formatMoney } from "@/lib/format/money"
import { fromCents } from "@/lib/money"
import type { RevisionOk } from "@/lib/finance/revisions/types"
import {
  TRUE_UP_COMPONENTS,
  TRUE_UP_COMPONENT_LABELS,
  TRUE_UP_STATUS_LABELS,
  type TrueUpActionRef,
  type TrueUpBillingTiming,
  type TrueUpComponent,
  type TrueUpMbaRow,
} from "@/lib/finance/trueUp/compute"
import { defaultFixComponents } from "@/lib/finance/trueUp/fixRequest"
import {
  REASON_LABELS,
  ledgerLabel,
  noInvoiceMonthOptions,
  trueUpPreviewGrid,
} from "@/lib/finance/trueUp/fixPanelModel"
import { trueUpMonthLabel } from "@/lib/finance/trueUp/viewModel"

type Preview = {
  ok: true
  baseVersionNumber: number
  newVersionNumber: number | null
  plan: RevisionOk
  impacts: string[]
  previewToken: string
  expiresAt: string
}

type Tab = "fix" | "note" | "history"

const TIMING_LABELS: Record<TrueUpBillingTiming, string> = {
  same_month: "Same month as the invoice",
  month_ahead: "A month ahead (invoice in Aug is Sep's)",
  in_arrears: "In arrears (invoice in Oct is Sep's)",
}

function money(cents: number): string {
  return formatMoney(fromCents(cents))
}

function gapText(cents: number): string {
  if (cents === 0) return money(0)
  return cents > 0 ? `${money(cents)} credit` : `${money(-cents)} charge`
}

async function postJson<T>(url: string, body: unknown, method = "POST"): Promise<T> {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  const json = (await res.json().catch(() => ({}))) as T & { message?: string }
  if (!res.ok) throw new Error(json.message ?? `Request failed (${res.status})`)
  return json
}

export function TrueUpFixSheet({
  row,
  asOf,
  from,
  currentMonth,
  timing,
  open,
  onOpenChange,
  onChanged,
}: {
  row: TrueUpMbaRow
  asOf: string
  from: string
  currentMonth: string
  timing: TrueUpBillingTiming
  open: boolean
  onOpenChange: (open: boolean) => void
  onChanged: () => void
}) {
  const [tab, setTab] = useState<Tab>("fix")
  const [components, setComponents] = useState<TrueUpComponent[]>(() => defaultFixComponents(row))
  const [strategy, setStrategy] = useState<"spread" | "carry">("carry")
  const [carryMonths, setCarryMonths] = useState<string[]>([])
  const [preview, setPreview] = useState<Preview | null>(null)
  const [undoPreview, setUndoPreview] = useState<Preview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [noteComponent, setNoteComponent] = useState<TrueUpComponent>(() => defaultFixComponents(row)[0] ?? "fee")
  const [noteAction, setNoteAction] = useState<"explained" | "one_off" | "credit_note">("explained")
  const [reason, setReason] = useState("timing")
  const [note, setNote] = useState("")
  const [invoice, setInvoice] = useState("")
  const [timingValue, setTimingValue] = useState<TrueUpBillingTiming>(timing)

  const carryOptions = noInvoiceMonthOptions(row, currentMonth)

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.")
    } finally {
      setBusy(false)
    }
  }

  const doPreview = () =>
    run(async () => {
      setPreview(null)
      const out = await postJson<Preview>("/api/finance/true-up/preview", {
        mbaNumber: row.mbaNumber,
        asOf,
        from,
        components,
        strategy,
        noInvoiceMonths: carryMonths,
      })
      setPreview(out)
    })

  const confirm = (p: Preview, what: string) =>
    run(async () => {
      const out = await postJson<{ newVersionNumber: number | null }>("/api/finance/true-up/apply", {
        previewToken: p.previewToken,
        confirm: true,
      })
      toast({ title: `${what} for ${row.mbaNumber}`, description: out.newVersionNumber ? `Published v${out.newVersionNumber}.` : undefined })
      setPreview(null)
      setUndoPreview(null)
      onChanged()
    })

  const saveNote = () =>
    run(async () => {
      await postJson("/api/finance/true-up/notes", {
        mbaNumber: row.mbaNumber,
        component: noteComponent,
        action: noteAction,
        asOf,
        from,
        reasonCode: noteAction === "explained" ? reason : null,
        note,
        xeroInvoice: noteAction === "credit_note" ? invoice : null,
      })
      toast({ title: "Recorded", description: `${TRUE_UP_COMPONENT_LABELS[noteComponent]} on ${row.mbaNumber}.` })
      setNote("")
      setInvoice("")
      onChanged()
    })

  const undo = (a: TrueUpActionRef) =>
    run(async () => {
      if (a.action === "schedule") {
        const out = await postJson<Preview>("/api/finance/true-up/undo", { actionId: a.id })
        setUndoPreview(out)
        return
      }
      await postJson(`/api/finance/true-up/notes/${a.id}`, {}, "DELETE")
      toast({ title: "Removed", description: ledgerLabel(a) })
      onChanged()
    })

  const saveTiming = (value: TrueUpBillingTiming) =>
    run(async () => {
      if (row.clientsId == null) throw new Error("This plan has no client id.")
      await postJson("/api/finance/true-up/billing-timing", { clientId: row.clientsId, timing: value }, "PUT")
      setTimingValue(value)
      toast({ title: "Billing timing saved", description: `${row.clientName}: ${TIMING_LABELS[value]}.` })
      onChanged()
    })

  const grid = preview ? trueUpPreviewGrid(preview.plan) : []
  const undoGrid = undoPreview ? trueUpPreviewGrid(undoPreview.plan) : []

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-3xl" data-true-up-fix-sheet="">
        <SheetHeader>
          <SheetTitle>
            True-up {row.mbaNumber} {row.clientName ? `· ${row.clientName}` : ""}
          </SheetTitle>
          <SheetDescription>
            To the end of {trueUpMonthLabel(asOf)}. Invoiced in Xero (sent and approved) against the billing schedule on v
            {row.versionNumber ?? "?"}. The delivery schedule never changes.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 grid gap-2 sm:grid-cols-4">
          {TRUE_UP_COMPONENTS.map((c) => {
            const s = row.components[c]
            return (
              <div key={c} className="rounded-md border border-border p-2 text-sm">
                <div className="text-xs text-muted-foreground">{TRUE_UP_COMPONENT_LABELS[c]}</div>
                <div className="num">{s.status === "matches" ? "Matches" : gapText(s.uncoveredGap)}</div>
                <div className="text-xs text-muted-foreground">{TRUE_UP_STATUS_LABELS[s.status]}</div>
              </div>
            )
          })}
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="mt-4">
          <TabsList>
            <TabsTrigger value="fix">Fix the schedule</TabsTrigger>
            <TabsTrigger value="note">Explain or raise</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>
        </Tabs>

        {error ? <p className="mt-3 text-sm text-status-critical-fg">{error}</p> : null}

        {tab === "fix" ? (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              Months with a sent invoice are set to what was invoiced. The open months from {trueUpMonthLabel(currentMonth)} take
              the difference, so every line still bills its contract total. Anything no open month can hold is recorded as a
              credit or charge to raise.
            </p>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Components</legend>
              {TRUE_UP_COMPONENTS.map((c) => (
                <label key={c} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={components.includes(c)}
                    onCheckedChange={(v) =>
                      setComponents((prev) => (v === true ? [...new Set([...prev, c])] : prev.filter((x) => x !== c)))
                    }
                  />
                  {TRUE_UP_COMPONENT_LABELS[c]}
                  <span className="text-xs text-muted-foreground">
                    {row.components[c].status === "matches" ? "matches" : gapText(row.components[c].uncoveredGap)}
                  </span>
                </label>
              ))}
            </fieldset>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Where the difference goes</legend>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="strategy" checked={strategy === "carry"} onChange={() => setStrategy("carry")} />
                Next open month (default). Anything it can&apos;t hold rolls on to the months after
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="strategy" checked={strategy === "spread"} onChange={() => setStrategy("spread")} />
                Spread over the remaining months, in line with the schedule
              </label>
            </fieldset>
            {carryOptions.length > 0 ? (
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Months with no invoice</legend>
                <p className="text-xs text-muted-foreground">
                  Left as scheduled unless you tick them. A ticked month moves its amount into the open months.
                </p>
                {carryOptions.map((m) => (
                  <label key={m} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={carryMonths.includes(m)}
                      onCheckedChange={(v) =>
                        setCarryMonths((prev) => (v === true ? [...new Set([...prev, m])].sort() : prev.filter((x) => x !== m)))
                      }
                    />
                    Carry {trueUpMonthLabel(m)}
                  </label>
                ))}
              </fieldset>
            ) : null}
            <div className="flex gap-2">
              <Button onClick={doPreview} disabled={busy || components.length === 0}>
                {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden /> : null}
                Preview
              </Button>
            </div>

            {preview ? (
              <div className="space-y-3 rounded-md border border-border p-3">
                <p className="text-sm font-medium">
                  Publishes v{preview.newVersionNumber ?? preview.baseVersionNumber + 1} (from v{preview.baseVersionNumber})
                </p>
                <ul className="space-y-1 text-sm">
                  {(preview.plan.trueUp?.components ?? []).map((s) => (
                    <li key={s.component}>
                      {TRUE_UP_COMPONENT_LABELS[s.component]}: gap {gapText(s.gapBefore)}, {money(s.rebalanced)} moved into the open
                      months
                      {s.residual !== 0 ? `, ${gapText(s.residual)} left to raise` : ""}
                    </li>
                  ))}
                </ul>
                <PreviewGrid rows={grid} />
                {preview.plan.warnings.length > 0 ? (
                  <ul className="list-disc pl-5 text-xs text-status-attention-fg">
                    {preview.plan.warnings.map((w, i) => (
                      <li key={i}>{w.message}</li>
                    ))}
                  </ul>
                ) : null}
                <ul className="list-disc pl-5 text-xs text-muted-foreground">
                  {preview.impacts.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
                <div className="flex gap-2">
                  <Button onClick={() => confirm(preview, "True-up published")} disabled={busy}>
                    Confirm
                  </Button>
                  <Button variant="outline" onClick={() => setPreview(null)} disabled={busy}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {tab === "note" ? (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              These never change the schedule. The gap is read again on the server. It flags again if it moves by $1 or more.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm">
                Component
                <select
                  className="h-9 rounded-input border border-border bg-background px-2 text-sm"
                  value={noteComponent}
                  onChange={(e) => setNoteComponent(e.target.value as TrueUpComponent)}
                >
                  {TRUE_UP_COMPONENTS.map((c) => (
                    <option key={c} value={c}>
                      {TRUE_UP_COMPONENT_LABELS[c]} ({gapText(row.components[c].uncoveredGap)})
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Record
                <select
                  className="h-9 rounded-input border border-border bg-background px-2 text-sm"
                  value={noteAction}
                  onChange={(e) => setNoteAction(e.target.value as typeof noteAction)}
                >
                  <option value="explained">Explained (no action needed)</option>
                  <option value="one_off">A one-off charge or credit to raise</option>
                  <option value="credit_note">A credit note to raise against an invoice</option>
                </select>
              </label>
              {noteAction === "explained" ? (
                <label className="flex flex-col gap-1 text-sm">
                  Why
                  <select
                    className="h-9 rounded-input border border-border bg-background px-2 text-sm"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  >
                    {Object.entries(REASON_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {noteAction === "credit_note" ? (
                <div className="flex flex-col gap-1">
                  <Label htmlFor="tu-invoice">Invoice number</Label>
                  <Input id="tu-invoice" value={invoice} onChange={(e) => setInvoice(e.target.value)} placeholder="INV-1513" />
                </div>
              ) : null}
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="tu-note">Note</Label>
              <Textarea id="tu-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
            </div>
            <Button onClick={saveNote} disabled={busy}>
              Record
            </Button>
          </div>
        ) : null}

        {tab === "history" ? (
          <div className="mt-4 space-y-4">
            <label className="flex flex-col gap-1 text-sm">
              {row.clientName || "Client"} billing timing
              <select
                className="h-9 max-w-md rounded-input border border-border bg-background px-2 text-sm"
                value={timingValue}
                disabled={busy || row.clientsId == null}
                onChange={(e) => void saveTiming(e.target.value as TrueUpBillingTiming)}
              >
                {(Object.keys(TIMING_LABELS) as TrueUpBillingTiming[]).map((t) => (
                  <option key={t} value={t}>
                    {TIMING_LABELS[t]}
                  </option>
                ))}
              </select>
              <span className="text-xs text-muted-foreground">
                Applies to every plan for this client. An invoice finance assigned by hand keeps its month.
              </span>
            </label>
            {row.actions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No true-up entries yet.</p>
            ) : (
              <ul className="space-y-2">
                {row.actions.map((a) => (
                  <li key={a.id} className="flex items-start justify-between gap-3 rounded-md border border-border p-2 text-sm">
                    <span>
                      {ledgerLabel(a)}
                      <span className="block text-xs text-muted-foreground">
                        {a.createdByName ?? "Someone"} · {a.createdAt ? new Date(a.createdAt).toLocaleString("en-AU", { timeZone: "Australia/Sydney" }) : ""}
                        {a.action !== "schedule" ? ` · ${gapText(a.action === "explained" ? a.gapCents : a.amountCents)}` : ""}
                      </span>
                    </span>
                    <Button variant="outline" size="sm" onClick={() => undo(a)} disabled={busy}>
                      {a.action === "schedule" ? "Undo" : "Remove"}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            {undoPreview ? (
              <div className="space-y-3 rounded-md border border-border p-3">
                <p className="text-sm font-medium">
                  Undo publishes v{undoPreview.newVersionNumber ?? undoPreview.baseVersionNumber + 1} with the schedule before the
                  true-up.
                </p>
                <PreviewGrid rows={undoGrid} />
                <div className="flex gap-2">
                  <Button onClick={() => confirm(undoPreview, "True-up undone")} disabled={busy}>
                    Confirm undo
                  </Button>
                  <Button variant="outline" onClick={() => setUndoPreview(null)} disabled={busy}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}

function PreviewGrid({ rows }: { rows: ReturnType<typeof trueUpPreviewGrid> }) {
  if (rows.length === 0) return null
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-muted-foreground">
            <th className="py-1 text-left font-normal">Month</th>
            {TRUE_UP_COMPONENTS.map((c) => (
              <th key={c} className="py-1 text-right font-normal">
                {TRUE_UP_COMPONENT_LABELS[c]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.month} className="border-t border-border">
              <td className="py-1">{trueUpMonthLabel(r.month)}</td>
              {r.cells.map((c) => (
                <td key={c.component} className="num py-1 text-right">
                  {c.before === c.after ? (
                    <span className="text-muted-foreground">{money(c.after)}</span>
                  ) : (
                    <>
                      <span className="text-muted-foreground line-through">{money(c.before)}</span> {money(c.after)}
                    </>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
