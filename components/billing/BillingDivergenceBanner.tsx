"use client"

import { useState } from "react"
import { ChevronDown, ChevronUp, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  summarizeBillingDivergence,
  type BillingDivergenceResult,
} from "@/lib/billing/compareBillingDivergence"
import { cn } from "@/lib/utils"

type Props = {
  divergence: BillingDivergenceResult | null
  /** When set, shows an Acknowledge action (former modal dismiss). */
  onAcknowledge?: () => void
  className?: string
}

/**
 * Inline attention banner for manual billing vs auto-computed differences.
 * Used inside MbaBillingModal (replaces BillingDivergenceModal stacking).
 */
export function BillingDivergenceBanner({ divergence, onAcknowledge, className }: Props) {
  const [expanded, setExpanded] = useState(false)

  if (!divergence?.isDivergent) return null

  const summary = summarizeBillingDivergence(divergence)
  const hasDetails = summary.lineMessages.length > 0 || summary.monthMessages.length > 0

  return (
    <div
      role="status"
      className={cn(
        "rounded-card border border-status-attention-fg/20 bg-status-attention-bg px-4 py-3 text-status-attention-fg",
        className
      )}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <p className="text-sm font-semibold">This campaign has manual billing differences</p>
            <p className="mt-1 text-sm opacity-90">
              {summary.headline ||
                "The saved billing schedule differs from what would be computed from the current bursts and line items."}
            </p>
          </div>
          {hasDetails ? (
            <div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-auto px-0 py-0 text-status-attention-fg hover:bg-transparent hover:text-status-attention-fg"
                onClick={() => setExpanded((v) => !v)}
              >
                {expanded ? (
                  <>
                    <ChevronUp className="mr-1 h-4 w-4" />
                    Hide details
                  </>
                ) : (
                  <>
                    <ChevronDown className="mr-1 h-4 w-4" />
                    Show details
                  </>
                )}
              </Button>
              {expanded ? (
                <div className="mt-2 max-h-[220px] space-y-3 overflow-y-auto text-sm">
                  {summary.lineMessages.length > 0 ? (
                    <ul className="list-disc space-y-1 pl-4">
                      {summary.lineMessages.map((msg, idx) => (
                        <li key={`banner-line-${idx}`}>{msg}</li>
                      ))}
                    </ul>
                  ) : null}
                  {summary.monthMessages.length > 0 ? (
                    <ul className="list-disc space-y-1 pl-4">
                      {summary.monthMessages.map((msg, idx) => (
                        <li key={`banner-month-${idx}`}>{msg}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
          {onAcknowledge ? (
            <div className="pt-1">
              <Button type="button" size="sm" variant="outline" onClick={onAcknowledge}>
                Acknowledge
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
