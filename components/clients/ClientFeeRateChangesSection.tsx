"use client"

import { useEffect, useId, useMemo, useRef, useState } from "react"

import { HelpTip } from "@/components/help/Help"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useConfirm } from "@/hooks/use-confirm"
import { getMelbourneTodayISO } from "@/lib/dates/melbourne"
import { clientFeeFormRows, type ClientFeeField } from "@/lib/finance/clientFeeChannels"
import { formatDateShort } from "@/lib/format/date"

type Change = { id: number; field: ClientFeeField; ratePct: number; effectiveFrom: string }
/** A write's answer: the list, or null with a message when it saved but the re-read failed. */
type WriteBody = { changes?: Change[] | null; message?: string }

async function readError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => null)) as { error?: string } | null
  return body?.error || `Request failed (${res.status})`
}

/**
 * Client fee rate changes with an effective date (S4). Admin only, switch
 * client_fee_rate_history on (the parent decides). Lives inside the client
 * form, so every button is type="button" and nothing submits it.
 */
export function ClientFeeRateChangesSection({
  clientId,
  channelFeesOn,
}: {
  clientId: number
  channelFeesOn: boolean
}) {
  const fees = useMemo(
    () => [...clientFeeFormRows("legacy"), ...(channelFeesOn ? clientFeeFormRows("0113") : [])],
    [channelFeesOn],
  )
  const labelOf = useMemo(() => new Map<string, string>(fees.map((f) => [f.field, f.label])), [fees])
  const [changes, setChanges] = useState<Change[]>([])
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [field, setField] = useState<ClientFeeField>(fees[0].field)
  const [rate, setRate] = useState("")
  const [from, setFrom] = useState("")
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [deleteError, setDeleteError] = useState<{ id: number; message: string } | null>(null)
  const [savedNote, setSavedNote] = useState<string | null>(null)
  const ids = { fee: useId(), rate: useId(), from: useId(), error: useId(), past: useId(), rowError: useId() }
  const headingRef = useRef<HTMLHeadingElement>(null)
  const { confirm, confirmDialog } = useConfirm()

  /** A saved write: the new list, or the message that it saved (re-read failed). */
  function applyWrite(body: WriteBody) {
    if (Array.isArray(body.changes)) {
      setChanges(body.changes)
      setSavedNote(null)
    } else {
      setSavedNote(body.message || "Saved. Reload the page to see the list.")
    }
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void fetch(`/api/clients/${clientId}/fee-rates`)
      .then(async (res) => {
        if (!res.ok) throw new Error(await readError(res))
        const body = (await res.json()) as { changes?: Change[] }
        if (!cancelled) {
          setChanges(body.changes ?? [])
          setListError(null)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setListError(err instanceof Error ? err.message : "Could not load rate changes")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [clientId])

  // The change in force today per fee: the latest one on or before today.
  const today = getMelbourneTodayISO()
  const inForce = new Set<number>()
  for (const f of fees) {
    const current = changes
      .filter((c) => c.field === f.field && c.effectiveFrom <= today)
      .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0]
    if (current) inForce.add(current.id)
  }
  const shown = changes.filter((c) => labelOf.has(c.field))
  const fromIsPast = from !== "" && from < today

  async function add() {
    const ratePct = Number(rate)
    if (rate.trim() === "" || !Number.isFinite(ratePct) || ratePct < 0 || ratePct > 100) {
      setFormError("Rate must be a percent from 0 to 100")
      return
    }
    if (!from) {
      setFormError("Pick the date the rate takes effect from")
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/fee-rates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field, ratePct, effectiveFrom: from }),
      })
      if (!res.ok) throw new Error(await readError(res))
      applyWrite((await res.json()) as WriteBody)
      setRate("")
      setFrom("")
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not save the rate change")
    } finally {
      setSaving(false)
    }
  }

  async function remove(c: Change) {
    const what = `${labelOf.get(c.field)} ${c.ratePct}% from ${formatDateShort(c.effectiveFrom)}`
    const yes = await confirm({
      title: "Delete this rate change?",
      description: `${what}. Plans saved after this take the rate in force without it. Published versions keep their rates.`,
      confirmLabel: "Delete",
      tone: "destructive",
    })
    if (!yes) return
    setBusyId(c.id)
    setDeleteError(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/fee-rates?changeId=${c.id}`, { method: "DELETE" })
      if (!res.ok) throw new Error(await readError(res))
      applyWrite((await res.json()) as WriteBody)
      // The row and its button are gone: focus the list heading.
      headingRef.current?.focus()
    } catch (err) {
      setDeleteError({ id: c.id, message: err instanceof Error ? err.message : "Could not delete the rate change" })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="min-w-0 rounded-md border p-4" aria-labelledby={`${ids.fee}-heading`}>
      {confirmDialog}
      <h3 id={`${ids.fee}-heading`} ref={headingRef} tabIndex={-1} className="mb-1 text-lg font-semibold">
        Fee rate changes
        <HelpTip id="clientFeeEffectiveDate" label="Fee rate changes" />
      </h3>
      <p className="mb-4 text-sm text-muted-foreground">
        A plan takes each fee at its start date: the latest change on or before it, else the Fees box above.
      </p>

      {savedNote ? (
        <p role="status" className="mb-4 text-sm">
          {savedNote}
        </p>
      ) : null}
      {loading ? <p className="mb-4 text-sm text-muted-foreground">Loading rate changes…</p> : null}
      {listError ? (
        <p role="alert" className="mb-4 rounded-input border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {listError}
        </p>
      ) : null}
      {!loading && !listError && shown.length === 0 ? (
        <p className="mb-4 text-sm text-muted-foreground">No rate changes. Every plan uses the Fees boxes.</p>
      ) : null}

      {shown.length > 0 ? (
        <ul className="mb-4 divide-y divide-border rounded-input border">
          {shown.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2">
              <p className="min-w-0 text-sm">
                <span className="font-medium">{labelOf.get(c.field)}</span>{" "}
                <span className="num">{c.ratePct}%</span> from {formatDateShort(c.effectiveFrom)}
                {inForce.has(c.id) ? <span className="ml-2 text-xs text-muted-foreground">(in force today)</span> : null}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busyId === c.id}
                onClick={() => void remove(c)}
                aria-label={`Delete ${labelOf.get(c.field)} ${c.ratePct}% from ${formatDateShort(c.effectiveFrom)}`}
                aria-describedby={deleteError?.id === c.id ? ids.rowError : undefined}
              >
                Delete
              </Button>
              {deleteError?.id === c.id ? (
                <p id={ids.rowError} role="alert" className="w-full text-sm text-destructive">
                  {deleteError.message}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="text-sm">
          <label htmlFor={ids.fee} className="mb-1 block font-medium">
            Fee
          </label>
          <Select value={field} onValueChange={(v) => setField(v as ClientFeeField)}>
            <SelectTrigger id={ids.fee}>
              <SelectValue placeholder="Fee" />
            </SelectTrigger>
            <SelectContent>
              {fees.map((f) => (
                <SelectItem key={f.field} value={f.field}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="text-sm">
          <label htmlFor={ids.rate} className="mb-1 block font-medium">
            Rate (%)
          </label>
          <Input
            id={ids.rate}
            type="number"
            inputMode="decimal"
            min={0}
            max={100}
            step="any"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            aria-describedby={formError ? ids.error : undefined}
          />
        </div>
        <div className="text-sm">
          <label htmlFor={ids.from} className="mb-1 block font-medium">
            Effective from
          </label>
          <Input
            id={ids.from}
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            aria-describedby={[formError ? ids.error : "", fromIsPast ? ids.past : ""].filter(Boolean).join(" ") || undefined}
          />
        </div>
      </div>

      {fromIsPast ? (
        <p id={ids.past} className="mt-3 text-sm text-muted-foreground">
          This date is before today. Plans that start on or after it, including ones already running, take the new
          rate the next time they are saved.
        </p>
      ) : null}

      {formError ? (
        <p id={ids.error} role="alert" className="mt-3 text-sm text-destructive">
          {formError}
        </p>
      ) : null}

      <div className="mt-3">
        <Button type="button" size="sm" disabled={saving} onClick={() => void add()}>
          {saving ? "Adding…" : "Add rate change"}
        </Button>
      </div>
    </section>
  )
}
