"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2 } from "lucide-react"
import { MoneyInput } from "@/components/ui/MoneyInput"
import { useToast } from "@/components/ui/use-toast"
import { MANUAL_BILLING_ADJUSTMENT_TOOLTIP } from "@/lib/billing/billingLineAdjustmentIndicators"
import {
  commitInlineScheduleAmountEdit,
  type InlineScheduleEditContext,
} from "@/lib/finance/commitInlineScheduleAmountEdit"
import { formatAUD } from "@/lib/format/money"
import type { BillingLineItem } from "@/lib/types/financeBilling"
import { cn } from "@/lib/utils"

type InlineScheduleAmountCellProps = {
  line: BillingLineItem
  ctx: InlineScheduleEditContext | null
  onCommitted?: (next: { amount: number; billing_mode?: "auto" | "manual" | null }) => void
  className?: string
}

export function InlineScheduleAmountCell({
  line,
  ctx,
  onCommitted,
  className,
}: InlineScheduleAmountCellProps) {
  const { toast } = useToast()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<number | null>(line.amount)
  const [busy, setBusy] = useState(false)
  const cancelledRef = useRef(false)
  const isManual = line.billing_mode === "manual"
  const canEdit =
    ctx != null &&
    ((line.line_type === "media" && Boolean(line.schedule_line_item_id?.trim())) ||
      (line.line_type === "service" &&
        ["T.Adserving", "Production", "Service"].includes(line.item_code)))

  useEffect(() => {
    if (!editing) setDraft(line.amount)
  }, [editing, line.amount])

  const commit = async (nextAmount: number | null) => {
    if (busy || !ctx || !canEdit) {
      setEditing(false)
      return
    }
    if (cancelledRef.current) {
      cancelledRef.current = false
      setDraft(line.amount)
      setEditing(false)
      return
    }
    const amount = nextAmount ?? 0
    if (Math.abs(amount - line.amount) < 0.005) {
      setEditing(false)
      return
    }
    setBusy(true)
    try {
      const result = await commitInlineScheduleAmountEdit({ ctx, line, amount })
      onCommitted?.({
        amount: result.amount,
        billing_mode: result.stampedManual ? "manual" : line.billing_mode,
      })
      toast({ title: "Billing updated", description: "Line amount saved for this version." })
      if (result.showedDivergenceToast) {
        toast({
          title: "Manual billing differences",
          description: "Saving a billing schedule that differs from the auto-computed values.",
        })
      }
      setEditing(false)
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Could not save amount",
        description: e instanceof Error ? e.message : "Unknown error",
      })
      setDraft(line.amount)
      setEditing(false)
    } finally {
      setBusy(false)
    }
  }

  if (!canEdit) {
    return (
      <p className={cn("num shrink-0 text-xs text-muted-foreground", className)}>
        {formatAUD(line.amount)}
      </p>
    )
  }

  if (!editing) {
    return (
      <button
        type="button"
        title={isManual ? MANUAL_BILLING_ADJUSTMENT_TOOLTIP : "Click to edit amount"}
        onClick={() => {
          cancelledRef.current = false
          setDraft(line.amount)
          setEditing(true)
        }}
        className={cn(
          "num shrink-0 rounded-input px-1.5 py-0.5 text-right text-xs text-muted-foreground",
          "hover:bg-table-row-hover hover:text-foreground",
          isManual && "underline decoration-dashed decoration-muted-foreground underline-offset-4",
          className
        )}
      >
        {formatAUD(line.amount)}
        {busy ? <Loader2 className="ml-1 inline h-3 w-3 animate-spin" /> : null}
      </button>
    )
  }

  return (
    <MoneyInput
      autoFocus
      value={draft}
      onChange={(v) => setDraft(v)}
      disabled={busy}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault()
          cancelledRef.current = true
          setDraft(line.amount)
          setEditing(false)
        }
        if (e.key === "Enter") {
          e.preventDefault()
          void commit(draft)
        }
      }}
      onBlur={() => {
        void commit(draft)
      }}
      className={cn(
        "num h-7 w-[7.5rem] shrink-0 rounded-input border border-input bg-background px-2 text-right text-xs",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
    />
  )
}
