"use client"

import { useEffect, useState } from "react"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

export type PeriodConfirmKind = "run" | "lock" | "approve" | "adjust" | "hold"

export type PeriodConfirmRequest = {
  kind: PeriodConfirmKind
  title: string
  consequence: string
  itemId?: number
  requireReason?: boolean
  requireAdjustmentCents?: boolean
}

type Props = {
  open: boolean
  request: PeriodConfirmRequest | null
  busy?: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (payload: { reason?: string; adjustmentCents?: number }) => void
}

export function PeriodConfirmDialog({
  open,
  request,
  busy,
  onOpenChange,
  onConfirm,
}: Props) {
  const [reason, setReason] = useState("")
  const [adjustmentCents, setAdjustmentCents] = useState("0")

  useEffect(() => {
    if (open) {
      setReason("")
      setAdjustmentCents("0")
    }
  }, [open, request?.kind, request?.itemId])

  const reasonOk = !request?.requireReason || reason.trim().length > 0
  const adjOk =
    !request?.requireAdjustmentCents || Number.isFinite(Number(adjustmentCents))
  const canConfirm = reasonOk && adjOk && !busy

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{request?.title ?? "Confirm"}</AlertDialogTitle>
          <AlertDialogDescription>{request?.consequence}</AlertDialogDescription>
        </AlertDialogHeader>

        {request?.requireAdjustmentCents ? (
          <div className="space-y-1">
            <Label htmlFor="period-adj-cents" className="text-xs text-muted-foreground">
              Adjustment (cents, can be negative)
            </Label>
            <Input
              id="period-adj-cents"
              className="num"
              value={adjustmentCents}
              onChange={(e) => setAdjustmentCents(e.target.value)}
            />
          </div>
        ) : null}

        {request?.requireReason ? (
          <div className="space-y-1">
            <Label htmlFor="period-reason" className="text-xs text-muted-foreground">
              Reason (required)
            </Label>
            <Textarea
              id="period-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
          </div>
        ) : null}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={!canConfirm}
            onClick={(e) => {
              e.preventDefault()
              if (!canConfirm) return
              onConfirm({
                reason: reason.trim() || undefined,
                adjustmentCents: request?.requireAdjustmentCents
                  ? Number(adjustmentCents)
                  : undefined,
              })
            }}
          >
            {busy ? "Working…" : "Confirm"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
