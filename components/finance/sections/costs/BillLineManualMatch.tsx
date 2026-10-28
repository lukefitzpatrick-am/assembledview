"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Combobox, type ComboboxOption } from "@/components/ui/combobox"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type {
  FixedCostBillLineView,
  FixedCostManualMatchInfo,
} from "@/lib/finance/sections/fixedCostMargin/compose"
import { formatMoney } from "@/lib/format/money"

const ROUTE = "/api/finance/sections/costs/bill-line-matches"

type PlanLineOption = {
  lineItemId: string
  publisher: string
  buyType: string
  fixedCost: boolean
  billedByMonth: Record<string, number>
}

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string; error?: string }
    return body.message || body.error || `Request failed (${res.status})`
  } catch {
    return `Request failed (${res.status})`
  }
}

/** Bill lines a finance admin can match by hand: unmatched or ambiguous, with a Xero line id. */
export function canMatchByHand(b: FixedCostBillLineView): boolean {
  return (b.state === "unmatched" || b.state === "ambiguous") && !!b.xeroLineItemId && !b.savedMatch
}

/** The MBA to open the picker on: the bill's MBA, else the MBA of the first candidate line. */
export function defaultMbaFor(b: FixedCostBillLineView, mbas: ReadonlyArray<{ mbaNumber: string }>): string {
  if (b.mbaNumber) return b.mbaNumber.toLowerCase()
  const known = mbas.map((m) => m.mbaNumber.toLowerCase())
  for (const c of [...b.candidates].map((x) => x.toLowerCase())) {
    if (known.includes(c)) return c
    const hit = known.filter((m) => c.startsWith(m)).sort((x, y) => y.length - x.length)[0]
    if (hit) return hit
  }
  return ""
}

function monthLabel(yyyyMm: string): string {
  const [y, m] = yyyyMm.split("-")
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  const mi = Number.parseInt(m ?? "1", 10) - 1
  return `${months[mi] ?? m} ${String(y ?? "").slice(2)}`
}

/** Inline form: pick the client / MBA, the plan line and the month for one bill line, then save. */
export function ManualMatchForm({
  bill,
  info,
  onSaved,
  onCancel,
}: {
  bill: FixedCostBillLineView
  info: FixedCostManualMatchInfo
  onSaved: () => void
  onCancel: () => void
}) {
  const [mba, setMba] = useState(() => defaultMbaFor(bill, info.mbas))
  const [lines, setLines] = useState<PlanLineOption[]>([])
  const [loading, setLoading] = useState(false)
  const [lineId, setLineId] = useState("")
  const [month, setMonth] = useState(bill.deliveredMonth)
  const [note, setNote] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const mbaOptions: ComboboxOption[] = useMemo(
    () =>
      info.mbas.map((m) => ({
        value: m.mbaNumber.toLowerCase(),
        label: `${m.clientName} · ${m.mbaNumber}`,
        keywords: `${m.clientName} ${m.mbaNumber}`,
      })),
    [info.mbas]
  )

  useEffect(() => {
    if (!mba) {
      setLines([])
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    void fetch(`${ROUTE}?mba=${encodeURIComponent(mba)}`, { credentials: "same-origin" })
      .then(async (res) => {
        if (!res.ok) throw new Error(await readError(res))
        return (await res.json()) as { lines: PlanLineOption[] }
      })
      .then((body) => {
        if (cancelled) return
        setLines(body.lines)
        const candidates = bill.candidates.map((c) => c.toLowerCase())
        const pick = body.lines.find((l) => candidates.includes(l.lineItemId)) ?? null
        setLineId(pick?.lineItemId ?? "")
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load plan lines")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [mba, bill.candidates])

  const lineOptions: ComboboxOption[] = useMemo(
    () =>
      lines.map((l) => ({
        value: l.lineItemId,
        label: `${l.lineItemId} · ${l.publisher || "no publisher"}${l.fixedCost ? " · fixed cost" : ""}`,
        keywords: `${l.lineItemId} ${l.publisher}`,
      })),
    [lines]
  )

  const monthOptions = useMemo(() => {
    const line = lines.find((l) => l.lineItemId === lineId)
    const set = new Set<string>([bill.deliveredMonth, bill.billedMonth, ...Object.keys(line?.billedByMonth ?? {})])
    return [...set].filter(Boolean).sort()
  }, [lines, lineId, bill.deliveredMonth, bill.billedMonth])

  const billedThatMonth = lines.find((l) => l.lineItemId === lineId)?.billedByMonth[month] ?? null

  const onSave = async () => {
    if (!mba || !lineId || !month) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(ROUTE, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          xeroInvoiceId: bill.xeroInvoiceId,
          xeroLineItemId: bill.xeroLineItemId,
          mbaNumber: mba,
          lineItemId: lineId,
          month,
          note,
        }),
      })
      if (!res.ok) throw new Error(await readError(res))
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3 rounded-md border border-border bg-surface-panel p-3">
      <p className="text-xs text-muted-foreground">
        Match {bill.invoiceNumber} line {bill.lineIndex + 1} ({formatMoney(bill.grossCents / 100)} ex GST) to a plan
        line. Saved matches are used before any automatic rule.
      </p>
      <div className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_minmax(220px,1fr)_140px_minmax(160px,1fr)]">
        <label className="space-y-1 text-xs text-muted-foreground">
          <span className="block font-medium text-foreground">Client / MBA</span>
          <Combobox
            options={mbaOptions}
            value={mba}
            onValueChange={(v) => setMba(v)}
            placeholder="Pick an MBA"
            searchPlaceholder="Search client or MBA"
            emptyText="No MBA found"
          />
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          <span className="block font-medium text-foreground">Plan line</span>
          <Combobox
            options={lineOptions}
            value={lineId}
            onValueChange={(v) => setLineId(v)}
            placeholder={loading ? "Loading lines…" : mba ? "Pick a line" : "Pick an MBA first"}
            searchPlaceholder="Search line or publisher"
            emptyText={mba ? "No media lines on the published plan" : "Pick an MBA first"}
            disabled={!mba || loading}
          />
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          <span className="block font-medium text-foreground">Month</span>
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Month" />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map((m) => (
                <SelectItem key={m} value={m}>
                  {monthLabel(m)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          <span className="block font-medium text-foreground">Note (optional)</span>
          <Input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="Why this line" />
        </label>
      </div>
      {billedThatMonth != null ? (
        <p className="text-xs text-muted-foreground">
          {lineId} bills {formatMoney(billedThatMonth / 100)} to the client in {monthLabel(month)}.
        </p>
      ) : null}
      {error ? <p className="text-xs text-status-critical-fg">{error}</p> : null}
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={() => void onSave()} disabled={!mba || !lineId || !month || saving}>
          {saving ? "Saving…" : "Save match"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

/** Remove a saved match (DELETE). */
export async function deleteManualMatch(id: number): Promise<void> {
  const res = await fetch(`${ROUTE}?id=${encodeURIComponent(String(id))}`, {
    method: "DELETE",
    credentials: "same-origin",
  })
  if (!res.ok) throw new Error(await readError(res))
}
