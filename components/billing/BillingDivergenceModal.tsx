"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import {
  summarizeBillingDivergence,
  type BillingDivergenceResult,
} from "@/lib/billing/compareBillingDivergence"

type Props = {
  open: boolean
  divergence: BillingDivergenceResult | null
  onAcknowledge: () => void
}

export function BillingDivergenceModal({ open, divergence, onAcknowledge }: Props) {
  const summary = divergence ? summarizeBillingDivergence(divergence) : null

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="max-w-lg"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>This campaign has manual billing differences</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm text-muted-foreground">
          <p>
            The saved billing schedule differs from what would be computed from the current bursts and
            line items. Review the differences below before continuing.
          </p>
          {summary?.headline ? (
            <p className="font-medium text-foreground">{summary.headline}</p>
          ) : null}
          {summary && summary.lineMessages.length > 0 ? (
            <div>
              <p className="mb-2 font-medium text-foreground">Line items</p>
              <ul className="max-h-[300px] space-y-2 overflow-y-auto rounded-md border border-border/60 p-3 text-foreground">
                {summary.lineMessages.map((msg, idx) => (
                  <li key={`line-${idx}`} className="border-b border-border/40 pb-2 last:border-0 last:pb-0">
                    {msg}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {summary && summary.monthMessages.length > 0 ? (
            <div>
              <p className="mb-2 font-medium text-foreground">Monthly totals</p>
              <ul className="max-h-[300px] space-y-2 overflow-y-auto rounded-md border border-border/60 p-3 text-foreground">
                {summary.monthMessages.map((msg, idx) => (
                  <li key={`month-${idx}`} className="border-b border-border/40 pb-2 last:border-0 last:pb-0">
                    {msg}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" onClick={onAcknowledge}>
            Acknowledge
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
