"use client"

import { useState } from "react"
import { ChevronDown, ChevronUp, AlertTriangle } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  summarizeBillingDivergence,
  type BillingDivergenceResult,
} from "@/lib/billing/compareBillingDivergence"
import { cn } from "@/lib/utils"

type Props = {
  divergence: BillingDivergenceResult | null
}

export function BillingDivergenceBanner({ divergence }: Props) {
  const [expanded, setExpanded] = useState(false)

  if (!divergence?.isDivergent) return null

  const summary = summarizeBillingDivergence(divergence)
  const hasDetails = summary.lineMessages.length > 0 || summary.monthMessages.length > 0

  return (
    <Alert
      className={cn(
        "mb-4 border-amber-400/80 bg-amber-50 text-amber-950",
        "dark:border-amber-500/50 dark:bg-amber-950/40 dark:text-amber-100"
      )}
    >
      <AlertTriangle className="text-amber-600 dark:text-amber-400" />
      <AlertTitle className="text-amber-950 dark:text-amber-50">Manual billing differences</AlertTitle>
      <AlertDescription className="text-amber-900/90 dark:text-amber-100/90">
        <p>{summary.headline}</p>
        {hasDetails ? (
          <div className="mt-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-auto px-0 py-0 text-amber-900 hover:bg-transparent hover:text-amber-950 dark:text-amber-100 dark:hover:text-amber-50"
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
