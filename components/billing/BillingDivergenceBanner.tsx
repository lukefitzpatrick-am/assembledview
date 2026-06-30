"use client"

import { useState } from "react"
import { ChevronDown, ChevronUp, AlertTriangle } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  summarizeBillingDivergence,
  type BillingDivergenceResult,
} from "@/lib/billing/compareBillingDivergence"

type Props = {
  divergence: BillingDivergenceResult | null
}

export function BillingDivergenceBanner({ divergence }: Props) {
  const [expanded, setExpanded] = useState(false)

  if (!divergence?.isDivergent) return null

  const summary = summarizeBillingDivergence(divergence)
  const hasDetails = summary.lineMessages.length > 0 || summary.monthMessages.length > 0

  return (
    <Alert className="mb-4 rounded-card border-pacing-behind-bg bg-pacing-behind-bg text-status-behind-fg">
      <AlertTriangle className="text-status-behind-fg" />
      <AlertTitle className="text-status-behind-fg">Manual billing differences</AlertTitle>
      <AlertDescription className="text-status-behind-fg">
        <p>{summary.headline}</p>
        {hasDetails ? (
          <div className="mt-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-auto px-0 py-0 text-status-behind-fg hover:bg-transparent hover:text-status-behind-fg"
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
              <div className="mt-2 max-h-[300px] space-y-3 overflow-y-auto">
                {summary.lineMessages.length > 0 ? (
                  <ul className="list-disc space-y-1 pl-4 text-sm">
                    {summary.lineMessages.map((msg, idx) => (
                      <li key={`banner-line-${idx}`}>{msg}</li>
                    ))}
                  </ul>
                ) : null}
                {summary.monthMessages.length > 0 ? (
                  <ul className="list-disc space-y-1 pl-4 text-sm">
                    {summary.monthMessages.map((msg, idx) => (
                      <li key={`banner-month-${idx}`}>{msg}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </AlertDescription>
    </Alert>
  )
}
