"use client"

import { useEffect, useRef, useState } from "react"
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
  /** Display chip: parent invoice is already billed. */
  invoiceBilled?: boolean
  /**
   * Write-gate confirm. Defaults to `invoiceBilled`. Pass
   * `.some(r => needsInlineAmountConfirm(r))` so a sibling with evidence
   * or a legacy billed=true row still warns even when records[0] is still ready.
   */
  confirmIfAnyBilled?: boolean
  className?: string
}

const BILLED_EDIT_TOAST = {
  title: "Already billed",
  description:
    "Saving a new amount will show billed drift against the invoiced snapshot until that snapshot is updated.",
} as const

const BILLED_REVERT_TOAST = {
  title: "Amount not saved",
  description:
    "The billed-month confirm was cancelled, so the previous amount was kept.",
} as const

export function InlineScheduleAmountCell({
  line,
  ctx,
  onCommitted,
  invoiceBilled = false,
  confirmIfAnyBilled,
  className,
}: InlineScheduleAmountCellProps) {
  const warnBeforeSave = confirmIfAnyBilled ?? invoiceBilled
  const { toast } = useToast()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<number | null>(line.amount)
  const [busy, setBusy] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pendingAmount, setPendingAmount] = useState<number | null>(null)
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

  const save = async (amount: number) => {
    if (!ctx || !canEdit) return
    setBusy(true)
    try {
      const result = await commitInlineScheduleAmountEdit({ ctx, line, amount })
      onCommitted?.({
        amount: result.amount,
        billing_mode: result.stampedManual ? "manual" : line.billing_mode,
      })
      toast({
        title: "Billing updated",
        description: warnBeforeSave
          ? BILLED_EDIT_TOAST.description
          : "Line amount saved for this version.",
      })
      if (result.showedDivergenceToast) {
        toast({
          title: "Manual billing differences",
          description: "Saving a billing schedule that differs from the auto-computed values.",
        })
      }
      setConfirmOpen(false)
      setPendingAmount(null)
      setEditing(false)
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Could not save amount",
        description: e instanceof Error ? e.message : "Unknown error",
      })
      setDraft(line.amount)
      setConfirmOpen(false)
      setPendingAmount(null)
      setEditing(false)
    } finally {
      setBusy(false)
    }
  }

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
    if (warnBeforeSave) {
      setPendingAmount(amount)
      setConfirmOpen(true)
      setEditing(false)
      return
    }
    await save(amount)
  }

  const revertPending = () => {
    setPendingAmount(null)
    setDraft(line.amount)
    setEditing(false)
    toast(BILLED_REVERT_TOAST)
  }

  if (!canEdit) {
    return (
      <p
        data-amount-frozen={ctx == null ? "" : undefined}
        className={cn("num shrink-0 text-xs text-muted-foreground", className)}
      >
        {formatAUD(line.amount)}
      </p>
    )
  }

  return (
    <>
      {editing ? (
        <MoneyInput
          autoFocus
          value={draft}
          onChange={(v) => {
            setDraft(v)
            void commit(v)
          }}
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
              e.currentTarget.blur()
            }
          }}
          className={cn(
            "num h-7 w-[7.5rem] shrink-0 rounded-input border border-input bg-background px-2 text-right text-xs",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            className
          )}
        />
      ) : (
        <button
          type="button"
          title={isManual ? MANUAL_BILLING_ADJUSTMENT_TOOLTIP : "Click to edit amount"}
          onClick={() => {
            cancelledRef.current = false
            setDraft(line.amount)
            if (invoiceBilled) {
              toast(BILLED_EDIT_TOAST)
            }
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
          {invoiceBilled ? (
            <span className="ml-1 text-[10px] uppercase tracking-wide text-muted-foreground">
              Already billed
            </span>
          ) : null}
          {busy ? <Loader2 className="ml-1 inline h-3 w-3 animate-spin" /> : null}
        </button>
      )}
      <AlertDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (open) {
            setConfirmOpen(true)
            return
          }
          if (busy) return
          setConfirmOpen(false)
          if (pendingAmount != null) revertPending()
        }}
      >
        <AlertDialogContent layer="nested">
          <AlertDialogHeader>
            <AlertDialogTitle>Already billed</AlertDialogTitle>
            <AlertDialogDescription>
              This month is already billed. Saving a new amount will show billed drift against
              the invoiced snapshot. Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy || pendingAmount == null}
              onClick={(e) => {
                e.preventDefault()
                if (pendingAmount == null || busy) return
                void save(pendingAmount)
              }}
            >
              {busy ? "Saving…" : "Continue"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
