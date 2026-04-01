"use client"

import { useEffect, useMemo, useState } from "react"
import { Plus, Trash2 } from "lucide-react"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toast } from "@/components/ui/use-toast"
import { formatMoney } from "@/lib/utils/money"
import type { BillingEdit, BillingLineItem, BillingRecord, BillingStatus } from "@/lib/types/financeBilling"
import { useFinanceStore } from "@/lib/finance/useFinanceStore"

function billingTypeBadgeClass(type: BillingRecord["billing_type"]) {
  if (type === "media") return "bg-blue-500/15 text-blue-700"
  if (type === "sow") return "bg-violet-500/15 text-violet-700"
  return "bg-green-500/15 text-green-700"
}

function statusBadgeClass(status: BillingRecord["status"]) {
  if (status === "draft") return "bg-muted text-muted-foreground"
  if (status === "booked") return "bg-blue-500/15 text-blue-700"
  if (status === "approved") return "bg-green-500/15 text-green-700"
  if (status === "invoiced") return "bg-amber-500/15 text-amber-700"
  if (status === "paid") return "bg-emerald-500/15 text-emerald-700"
  return "bg-rose-500/15 text-rose-700"
}

interface BillingEditPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  record: BillingRecord | null
}

type RecordDraft = BillingRecord

const editableRecordFields: Array<keyof BillingRecord> = [
  "campaign_name",
  "po_number",
  "invoice_date",
  "payment_days",
  "payment_terms",
  "status",
]

function toCurrencyInput(amount: number) {
  return formatMoney(amount, {
    locale: "en-AU",
    currency: "AUD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function parseAmount(value: string): number {
  const normalized = value.replace(/[^0-9.-]+/g, "")
  const n = Number(normalized)
  return Number.isFinite(n) ? n : 0
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function BillingEditPanel({ open, onOpenChange, record }: BillingEditPanelProps) {
  const setBillingRecords = useFinanceStore((s) => s.setBillingRecords)
  const storeRecords = useFinanceStore((s) => s.billingRecords)
  const [originalRecord, setOriginalRecord] = useState<RecordDraft | null>(null)
  const [draft, setDraft] = useState<RecordDraft | null>(null)
  const [amountInputs, setAmountInputs] = useState<Record<number, string>>({})
  const [history, setHistory] = useState<BillingEdit[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)

  useEffect(() => {
    if (!record) {
      setOriginalRecord(null)
      setDraft(null)
      setAmountInputs({})
      setHistory([])
      return
    }
    const next = deepClone(record)
    setOriginalRecord(next)
    setDraft(deepClone(next))
    const nextAmounts: Record<number, string> = {}
    for (const item of next.line_items) {
      nextAmounts[item.id] = toCurrencyInput(item.amount)
    }
    setAmountInputs(nextAmounts)
  }, [record])

  useEffect(() => {
    if (!open || !record) return
    const loadHistory = async () => {
      setHistoryLoading(true)
      try {
        const res = await fetch(`/api/finance/edits?finance_billing_records_id=${record.id}`)
        if (!res.ok) throw new Error("Failed to load edit history")
        const json = await res.json()
        setHistory(Array.isArray(json) ? json : Array.isArray(json?.edits) ? json.edits : [])
      } catch {
        setHistory([])
      } finally {
        setHistoryLoading(false)
      }
    }
    void loadHistory()
  }, [open, record])

  const changedRecordFields = useMemo(() => {
    const changed = new Set<string>()
    if (!originalRecord || !draft) return changed
    for (const field of editableRecordFields) {
      const lhs = originalRecord[field]
      const rhs = draft[field]
      if ((lhs ?? null) !== (rhs ?? null)) changed.add(String(field))
    }
    return changed
  }, [draft, originalRecord])

  const changedLineFields = useMemo(() => {
    const changed = new Set<string>()
    if (!originalRecord || !draft) return changed
    const originalMap = new Map(originalRecord.line_items.map((li) => [li.id, li]))
    for (const li of draft.line_items) {
      const old = originalMap.get(li.id)
      if (!old) {
        changed.add(`${li.id}:new`)
        continue
      }
      if (old.amount !== li.amount) changed.add(`${li.id}:amount`)
      if ((old.description ?? "") !== (li.description ?? "")) changed.add(`${li.id}:description`)
      if ((old.media_type ?? "") !== (li.media_type ?? "")) changed.add(`${li.id}:media_type`)
      if ((old.item_code ?? "") !== (li.item_code ?? "")) changed.add(`${li.id}:item_code`)
    }
    return changed
  }, [draft, originalRecord])

  const hasPendingChanges = useMemo(() => {
    if (!originalRecord || !draft) return false
    if (changedRecordFields.size > 0) return true
    if (changedLineFields.size > 0) return true
    const originalIds = new Set(originalRecord.line_items.map((li) => li.id))
    const draftIds = new Set(draft.line_items.map((li) => li.id))
    if (originalIds.size !== draftIds.size) return true
    for (const id of originalIds) {
      if (!draftIds.has(id)) return true
    }
    return false
  }, [changedLineFields, changedRecordFields, draft, originalRecord])

  const runningTotal = useMemo(() => {
    if (!draft) return 0
    return draft.line_items.reduce((sum, li) => sum + Number(li.amount || 0), 0)
  }, [draft])

  const setRecordField = <K extends keyof BillingRecord>(field: K, value: BillingRecord[K]) => {
    setDraft((prev) => (prev ? { ...prev, [field]: value } : prev))
  }

  const updateLineItem = (lineId: number, patch: Partial<BillingLineItem>) => {
    setDraft((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        line_items: prev.line_items.map((item) => (item.id === lineId ? { ...item, ...patch } : item)),
      }
    })
  }

  const addLineItem = () => {
    setDraft((prev) => {
      if (!prev) return prev
      const tempId = -Date.now()
      const next: BillingLineItem = {
        id: tempId,
        finance_billing_records_id: prev.id,
        item_code: "",
        line_type: prev.billing_type === "retainer" ? "retainer" : "media",
        media_type: null,
        description: null,
        publisher_name: null,
        amount: 0,
        client_pays_media: false,
        sort_order: prev.line_items.length + 1,
      }
      setAmountInputs((current) => ({ ...current, [tempId]: toCurrencyInput(0) }))
      return { ...prev, line_items: [...prev.line_items, next] }
    })
  }

  const removeLineItem = (lineId: number) => {
    if (!window.confirm("Remove this line item?")) return
    setDraft((prev) => {
      if (!prev) return prev
      return { ...prev, line_items: prev.line_items.filter((item) => item.id !== lineId) }
    })
  }

  const discardChanges = () => {
    if (!originalRecord) return
    const reset = deepClone(originalRecord)
    setDraft(reset)
    const nextAmounts: Record<number, string> = {}
    for (const item of reset.line_items) nextAmounts[item.id] = toCurrencyInput(item.amount)
    setAmountInputs(nextAmounts)
  }

  const getChangedFieldClass = (key: string) =>
    `rounded-md border-l-2 pl-2 ${key ? "border-l-amber-400" : "border-l-transparent"}`

  const buildEditLogs = (before: BillingRecord, after: BillingRecord): Array<Record<string, unknown>> => {
    const logs: Array<Record<string, unknown>> = []
    for (const field of editableRecordFields) {
      const oldValue = before[field]
      const newValue = after[field]
      if ((oldValue ?? null) === (newValue ?? null)) continue
      logs.push({
        finance_billing_records_id: after.id,
        finance_billing_line_items_id: null,
        edit_type: field === "status" ? "status_change" : "field_change",
        field_name: String(field),
        old_value: oldValue == null ? null : String(oldValue),
        new_value: newValue == null ? null : String(newValue),
      })
    }

    const beforeMap = new Map(before.line_items.map((li) => [li.id, li]))
    const afterMap = new Map(after.line_items.map((li) => [li.id, li]))

    for (const [id, next] of afterMap) {
      const old = beforeMap.get(id)
      if (!old) {
        logs.push({
          finance_billing_records_id: after.id,
          finance_billing_line_items_id: id > 0 ? id : null,
          edit_type: "line_add",
          field_name: "line_item",
          old_value: null,
          new_value: JSON.stringify(next),
        })
        continue
      }
      if (old.amount !== next.amount) {
        logs.push({
          finance_billing_records_id: after.id,
          finance_billing_line_items_id: id,
          edit_type: "amount_change",
          field_name: "amount",
          old_value: String(old.amount),
          new_value: String(next.amount),
        })
      }
      for (const field of ["description", "media_type", "item_code"] as const) {
        if ((old[field] ?? null) !== (next[field] ?? null)) {
          logs.push({
            finance_billing_records_id: after.id,
            finance_billing_line_items_id: id,
            edit_type: "field_change",
            field_name: field,
            old_value: old[field] == null ? null : String(old[field]),
            new_value: next[field] == null ? null : String(next[field]),
          })
        }
      }
    }

    for (const [id, old] of beforeMap) {
      if (!afterMap.has(id)) {
        logs.push({
          finance_billing_records_id: after.id,
          finance_billing_line_items_id: id,
          edit_type: "line_remove",
          field_name: "line_item",
          old_value: JSON.stringify(old),
          new_value: null,
        })
      }
    }

    return logs
  }

  const persistDraft = async (opts?: { silent?: boolean }) => {
    if (!draft || !originalRecord || saving) return false
    const prevOriginal = deepClone(originalRecord)
    const prevDraft = deepClone(draft)
    const nextDraft = deepClone(draft)
    nextDraft.status = "draft"

    setSaving(true)
    setOriginalRecord(nextDraft)
    setDraft(nextDraft)
    const previousStoreSnapshot = deepClone(storeRecords)
    setBillingRecords(
      storeRecords.map((row) => (row.id === nextDraft.id ? { ...row, ...nextDraft } : row))
    )

    try {
      const recordPatchBody = {
        campaign_name: nextDraft.campaign_name,
        po_number: nextDraft.po_number,
        invoice_date: nextDraft.invoice_date,
        payment_days: nextDraft.payment_days,
        payment_terms: nextDraft.payment_terms,
        status: "draft",
      }
      const recordRes = await fetch(`/api/finance/billing/${nextDraft.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(recordPatchBody),
      })
      if (!recordRes.ok) throw new Error("Failed to save billing record")

      const beforeMap = new Map(prevOriginal.line_items.map((li) => [li.id, li]))
      const afterMap = new Map(nextDraft.line_items.map((li) => [li.id, li]))

      for (const [id, line] of afterMap) {
        if (id > 0) {
          const before = beforeMap.get(id)
          const changed =
            !before ||
            before.amount !== line.amount ||
            (before.description ?? "") !== (line.description ?? "") ||
            (before.media_type ?? "") !== (line.media_type ?? "") ||
            (before.item_code ?? "") !== (line.item_code ?? "")
          if (!changed) continue

          const res = await fetch(`/api/finance/billing/line-items/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              amount: line.amount,
              description: line.description,
              media_type: line.media_type,
              item_code: line.item_code,
            }),
          })
          if (!res.ok) throw new Error("Failed to save line item")
        } else {
          const res = await fetch(`/api/finance/billing/line-items`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              finance_billing_records_id: nextDraft.id,
              amount: line.amount,
              description: line.description,
              media_type: line.media_type,
              item_code: line.item_code,
              line_type: line.line_type,
              sort_order: line.sort_order,
            }),
          })
          if (!res.ok) throw new Error("Failed to add line item")
        }
      }

      for (const [id] of beforeMap) {
        if (afterMap.has(id)) continue
        const res = await fetch(`/api/finance/billing/line-items/${id}`, { method: "DELETE" })
        if (!res.ok) throw new Error("Failed to remove line item")
      }

      const logs = buildEditLogs(prevOriginal, nextDraft)
      for (const log of logs) {
        const res = await fetch("/api/finance/edits", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(log),
        })
        if (!res.ok) throw new Error("Failed to log edit")
      }

      if (!opts?.silent) {
        toast({ title: "Draft saved", description: "Your billing edits were saved as draft." })
      }
      setOriginalRecord(nextDraft)
      setDraft(nextDraft)
      return true
    } catch (e) {
      setOriginalRecord(prevOriginal)
      setDraft(prevDraft)
      setBillingRecords(previousStoreSnapshot)
      if (!opts?.silent) {
        toast({
          title: "Save failed",
          description: e instanceof Error ? e.message : "Failed to save draft edits.",
          variant: "destructive",
        })
      }
      return false
    } finally {
      setSaving(false)
    }
  }

  const saveDraft = async () => {
    void (await persistDraft())
  }

  const publishChanges = async () => {
    if (!draft || publishing || saving) return
    setPublishing(true)
    const prevOriginal = originalRecord ? deepClone(originalRecord) : null
    const prevDraft = deepClone(draft)
    try {
      const didSave = await persistDraft({ silent: true })
      if (!didSave) {
        throw new Error("Failed to save draft before publish")
      }
      const publishRes = await fetch("/api/finance/edits/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ finance_billing_records_id: draft.id }),
      })
      if (!publishRes.ok) throw new Error("Failed to publish edits")

      setOriginalRecord((prev) => (prev ? { ...prev, has_pending_edits: false } : prev))
      setDraft((prev) => (prev ? { ...prev, has_pending_edits: false } : prev))
      toast({ title: "Published", description: "Draft edits have been published." })
    } catch (e) {
      if (prevOriginal) setOriginalRecord(prevOriginal)
      setDraft(prevDraft)
      toast({
        title: "Publish failed",
        description: e instanceof Error ? e.message : "Unable to publish edits.",
        variant: "destructive",
      })
    } finally {
      setPublishing(false)
    }
  }

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [onOpenChange, open])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="!w-full max-w-full sm:max-w-2xl">
        {!draft ? null : (
          <div className="space-y-4">
            <SheetHeader>
              <SheetTitle>{draft.client_name}</SheetTitle>
              <SheetDescription>
                {draft.mba_number || "No MBA"}
              </SheetDescription>
            </SheetHeader>

            <div className="flex flex-wrap items-center gap-2">
              <Badge className={billingTypeBadgeClass(draft.billing_type)}>{draft.billing_type.toUpperCase()}</Badge>
              <Badge className={statusBadgeClass(draft.status)}>{draft.status}</Badge>
              {hasPendingChanges && (
                <span className="inline-flex items-center gap-1 text-xs text-amber-700">
                  <span className="h-2 w-2 rounded-full bg-amber-500" />
                  Pending edits
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className={getChangedFieldClass(changedRecordFields.has("campaign_name") ? "changed" : "")}>
                <Label className="mb-1 block">Campaign Name</Label>
                <Input
                  value={draft.campaign_name || ""}
                  onChange={(e) => setRecordField("campaign_name", e.target.value)}
                />
              </div>
              <div className={getChangedFieldClass(changedRecordFields.has("po_number") ? "changed" : "")}>
                <Label className="mb-1 block">PO Number</Label>
                <Input value={draft.po_number || ""} onChange={(e) => setRecordField("po_number", e.target.value)} />
              </div>
              <div className={getChangedFieldClass(changedRecordFields.has("invoice_date") ? "changed" : "")}>
                <Label className="mb-1 block">Invoice Date</Label>
                <Input
                  type="date"
                  value={draft.invoice_date ? draft.invoice_date.slice(0, 10) : ""}
                  onChange={(e) => setRecordField("invoice_date", e.target.value || null)}
                />
              </div>
              <div className={getChangedFieldClass(changedRecordFields.has("status") ? "changed" : "")}>
                <Label className="mb-1 block">Status</Label>
                <Select value={draft.status} onValueChange={(v) => setRecordField("status", v as BillingStatus)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="booked">Booked</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="invoiced">Invoiced</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className={getChangedFieldClass(changedRecordFields.has("payment_days") ? "changed" : "")}>
                <Label className="mb-1 block">Payment Days</Label>
                <Input
                  type="number"
                  value={draft.payment_days}
                  onChange={(e) => setRecordField("payment_days", Number(e.target.value || 0))}
                />
              </div>
              <div className={getChangedFieldClass(changedRecordFields.has("payment_terms") ? "changed" : "")}>
                <Label className="mb-1 block">Payment Terms</Label>
                <Input
                  value={draft.payment_terms || ""}
                  onChange={(e) => setRecordField("payment_terms", e.target.value)}
                />
              </div>
            </div>

            <div className="rounded-md border border-border/40">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item Code</TableHead>
                    <TableHead>Media Type</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {draft.line_items.map((item) => {
                    const amountKey = `${item.id}:amount`
                    const descKey = `${item.id}:description`
                    const mediaKey = `${item.id}:media_type`
                    const codeKey = `${item.id}:item_code`
                    return (
                      <TableRow key={item.id}>
                        <TableCell className={getChangedFieldClass(changedLineFields.has(codeKey) ? "changed" : "")}>
                          <Input
                            value={item.item_code || ""}
                            onChange={(e) => updateLineItem(item.id, { item_code: e.target.value })}
                          />
                        </TableCell>
                        <TableCell className={getChangedFieldClass(changedLineFields.has(mediaKey) ? "changed" : "")}>
                          <Input
                            value={item.media_type || ""}
                            onChange={(e) => updateLineItem(item.id, { media_type: e.target.value || null })}
                          />
                        </TableCell>
                        <TableCell className={getChangedFieldClass(changedLineFields.has(descKey) ? "changed" : "")}>
                          <Input
                            value={item.description || ""}
                            onChange={(e) => updateLineItem(item.id, { description: e.target.value || null })}
                          />
                        </TableCell>
                        <TableCell className={getChangedFieldClass(changedLineFields.has(amountKey) ? "changed" : "")}>
                          <Input
                            value={amountInputs[item.id] ?? toCurrencyInput(item.amount)}
                            onFocus={(e) => {
                              const n = parseAmount(e.target.value)
                              setAmountInputs((prev) => ({ ...prev, [item.id]: n.toString() }))
                            }}
                            onChange={(e) => {
                              const nextRaw = e.target.value
                              setAmountInputs((prev) => ({ ...prev, [item.id]: nextRaw }))
                              updateLineItem(item.id, { amount: parseAmount(nextRaw) })
                            }}
                            onBlur={(e) => {
                              const parsed = parseAmount(e.target.value)
                              updateLineItem(item.id, { amount: parsed })
                              setAmountInputs((prev) => ({ ...prev, [item.id]: toCurrencyInput(parsed) }))
                            }}
                            className="text-right"
                          />
                        </TableCell>
                        <TableCell>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => removeLineItem(item.id)}
                            aria-label="Remove line item"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
              <div className="flex items-center justify-between border-t border-border/40 px-3 py-2">
                <Button type="button" variant="outline" size="sm" onClick={addLineItem}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add line item
                </Button>
                <div className="text-sm font-semibold">
                  Running total:{" "}
                  {formatMoney(runningTotal, {
                    locale: "en-AU",
                    currency: "AUD",
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2 border-t border-border/40 pt-3">
              <Button variant="outline" onClick={discardChanges} disabled={saving || publishing || !hasPendingChanges}>
                Discard changes
              </Button>
              <Button variant="secondary" onClick={() => void saveDraft()} disabled={saving || publishing}>
                {saving ? "Saving..." : "Save draft"}
              </Button>
              <Button onClick={() => void publishChanges()} disabled={saving || publishing}>
                {publishing ? "Publishing..." : "Publish"}
              </Button>
            </div>

            <Accordion type="single" collapsible className="w-full rounded-md border border-border/40 px-3">
              <AccordionItem value="history" className="border-b-0">
                <AccordionTrigger>Edit history</AccordionTrigger>
                <AccordionContent>
                  {historyLoading ? (
                    <p className="text-sm text-muted-foreground">Loading history...</p>
                  ) : history.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No previous edits found.</p>
                  ) : (
                    <div className="space-y-2">
                      {history.map((edit) => (
                        <div key={edit.id} className="rounded-md border border-border/40 bg-muted/30 p-2 text-xs">
                          <div className="font-medium">
                            {edit.edited_by_name} · {new Date(edit.created_at).toLocaleString()}
                          </div>
                          <div className="text-muted-foreground">
                            {edit.edit_type} on {edit.field_name}: {edit.old_value ?? "null"} {"->"}{" "}
                            {edit.new_value ?? "null"}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
