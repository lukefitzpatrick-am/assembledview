"use client"

import { useEffect, useState } from "react"
import { Loader2, StickyNote } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/use-toast"
import { saveBillingNotes } from "@/lib/finance/api"
import type { BillingRecord } from "@/lib/types/financeBilling"
import { cn } from "@/lib/utils"

const NOTES_MAX_LEN = 2000

type ReceivableNotesButtonProps = {
  record: BillingRecord
  onSaved?: (result: {
    invoice_key: string
    notes: string
    persisted_record_id: number
  }) => void
  className?: string
}

export function ReceivableNotesButton({ record, onSaved, className }: ReceivableNotesButtonProps) {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(record.notes ?? "")
  const [busy, setBusy] = useState(false)
  const hasNotes = Boolean((record.notes ?? "").trim())
  const disabled = !record.invoice_key

  useEffect(() => {
    if (open) setDraft(record.notes ?? "")
  }, [open, record.notes])

  const persist = async (nextNotes: string) => {
    if (busy || disabled) return
    setBusy(true)
    try {
      const res = await saveBillingNotes({
        billing_type: record.billing_type,
        clients_id: record.clients_id,
        client_name: record.client_name,
        mba_number: record.mba_number,
        campaign_name: record.campaign_name,
        billing_month: record.billing_month,
        notes: nextNotes,
        total: record.total,
      })
      onSaved?.(res)
      toast({
        title: nextNotes.trim() ? "Note saved" : "Note cleared",
      })
      setOpen(false)
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Could not save note",
        description: e instanceof Error ? e.message : "Unknown error",
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={hasNotes ? "Edit billing note" : "Add billing note"}
          disabled={disabled}
          className={cn(
            "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-input border border-border transition-colors",
            hasNotes
              ? "bg-primary/15 text-primary"
              : "bg-background text-muted-foreground hover:bg-table-row-hover hover:text-foreground",
            "disabled:cursor-not-allowed disabled:opacity-50",
            className
          )}
        >
          <StickyNote className={cn("h-3.5 w-3.5", hasNotes && "fill-current")} aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3 p-3">
        <div>
          <p className="text-xs font-medium text-foreground">Billing note</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Visible on this invoice across finance views. Max {NOTES_MAX_LEN} characters.
          </p>
        </div>
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, NOTES_MAX_LEN))}
          rows={4}
          maxLength={NOTES_MAX_LEN}
          placeholder="Add a note…"
          disabled={busy}
          className="min-h-[96px] resize-y text-sm"
        />
        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy || !hasNotes}
            onClick={() => void persist("")}
          >
            Clear
          </Button>
          <div className="flex items-center gap-2">
            <span className="num text-[10px] text-muted-foreground">
              {draft.length}/{NOTES_MAX_LEN}
            </span>
            <Button
              type="button"
              size="sm"
              disabled={busy}
              onClick={() => void persist(draft.trim())}
            >
              {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              Save
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
