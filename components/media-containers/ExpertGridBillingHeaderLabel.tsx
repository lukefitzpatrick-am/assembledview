"use client"

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

const BILLING_HEADER: Record<string, { short: string; full: string }> = {
  "Fixed Cost Media": { short: "Fixed", full: "Fixed Cost Media" },
  "Client Pays for Media": { short: "Client pays", full: "Client Pays for Media" },
  "Budget Includes Fees": { short: "Incl. fees", full: "Budget Includes Fees" },
  "No Ad Serving": { short: "No ad srv.", full: "No Ad Serving" },
}

/** Short label + tooltip for expert grid billing columns; otherwise returns `label`. */
export function ExpertGridBillingHeaderLabel({ label }: { label: string }) {
  const entry = BILLING_HEADER[label]
  if (!entry) return label
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-help">{entry.short}</span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs text-xs">
        {entry.full}
      </TooltipContent>
    </Tooltip>
  )
}
