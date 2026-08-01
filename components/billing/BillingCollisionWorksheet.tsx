"use client"

import { useEffect, useState } from "react"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { CollisionDecision, CollisionRow } from "@/lib/billing/collisionWorksheet"
import { formatAUD } from "@/lib/format/money"
import { cn } from "@/lib/utils"

export type BillingCollisionWorksheetProps = {
  open: boolean
  rows: CollisionRow[]
  onConfirm: (choices: { lineItemId: string; decision: CollisionDecision }[]) => void
  onCancel: () => void
}

const LABELS: Record<CollisionDecision, string> = {
  keep_shape_delta: "Keep shape + delta",
  rescale: "Rescale proportionally",
  recalc_auto: "Recalculate to auto",
}

/**
 * PC4 — pause before publish when manual-billing lines' media totals changed.
 * Only affected lines appear. Default = keep_shape_delta.
 */
export function BillingCollisionWorksheet({
  open,
  rows,
  onConfirm,
  onCancel,
}: BillingCollisionWorksheetProps) {
  const [choices, setChoices] = useState<Map<string, CollisionDecision>>(new Map())

  useEffect(() => {
    if (!open) return
    const m = new Map<string, CollisionDecision>()
    for (const r of rows) m.set(r.lineItemId, "keep_shape_delta")
    setChoices(m)
  }, [open, rows])

  const setAll = (decision: CollisionDecision) => {
    const next = new Map<string, CollisionDecision>()
    for (const r of rows) next.set(r.lineItemId, decision)
    setChoices(next)
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel()
      }}
    >
      <AlertDialogContent className="max-w-3xl">
        <AlertDialogHeader>
          <AlertDialogTitle>Billing totals changed</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                These lines have manual billing timing and their media totals changed. Choose how to
                reshape each override before publish. Unchanged lines are omitted.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex flex-wrap gap-1.5">
          <Button type="button" size="sm" variant="outline" onClick={() => setAll("keep_shape_delta")}>
            Bulk: keep + delta
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setAll("rescale")}>
            Bulk: rescale
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setAll("recalc_auto")}>
            Bulk: recalc auto
          </Button>
        </div>

        <div className="max-h-[50vh] overflow-auto rounded-input border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Line</TableHead>
                <TableHead className="text-right">Was</TableHead>
                <TableHead className="text-right">Now</TableHead>
                <TableHead className="text-right">Δ</TableHead>
                <TableHead>Decision</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const decision = choices.get(r.lineItemId) ?? "keep_shape_delta"
                return (
                  <TableRow key={r.lineItemId}>
                    <TableCell className="max-w-[14rem] truncate text-sm" title={r.label}>
                      {r.label || r.lineItemId}
                    </TableCell>
                    <TableCell className="num text-right text-sm">{formatAUD(r.oldTotal)}</TableCell>
                    <TableCell className="num text-right text-sm">{formatAUD(r.newTotal)}</TableCell>
                    <TableCell
                      className={cn(
                        "num text-right text-sm",
                        r.delta < 0 ? "text-status-critical-fg" : "text-foreground"
                      )}
                    >
                      {formatAUD(r.delta)}
                    </TableCell>
                    <TableCell>
                      <select
                        className="h-8 w-full rounded-input border border-border bg-background px-2 text-xs"
                        value={decision}
                        onChange={(e) => {
                          const v = e.target.value as CollisionDecision
                          setChoices((prev) => {
                            const next = new Map(prev)
                            next.set(r.lineItemId, v)
                            return next
                          })
                        }}
                      >
                        {(Object.keys(LABELS) as CollisionDecision[]).map((k) => (
                          <option key={k} value={k}>
                            {LABELS[k]}
                          </option>
                        ))}
                      </select>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>

        <AlertDialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
          <AlertDialogCancel
            type="button"
            onClick={(e) => {
              e.preventDefault()
              onCancel()
            }}
          >
            Cancel save
          </AlertDialogCancel>
          <Button
            type="button"
            className={buttonVariants()}
            onClick={() => {
              onConfirm(
                rows.map((r) => ({
                  lineItemId: r.lineItemId,
                  decision: choices.get(r.lineItemId) ?? "keep_shape_delta",
                }))
              )
            }}
          >
            Apply & continue publish
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
