"use client"

import { TriangleAlert } from "lucide-react"

import { Input } from "@/components/ui/input"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { formatMoney } from "@/lib/format/money"
import { displayLineTotals } from "@/lib/money/burst"
import { fromCents } from "@/lib/money/cents"

export const NET_FEE_WARNING =
  "A 100% fee on a net budget isn't valid. Check the fee."

const readoutClass =
  "h-10 w-full border-border/40 bg-muted/30 text-sm text-muted-foreground"

function formatCents(cents: number): string {
  return formatMoney(fromCents(cents), { locale: "en-AU", currency: "AUD" })
}

export function NetFeeWarning() {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="inline-flex shrink-0 text-status-warning"
            aria-label={NET_FEE_WARNING}
          >
            <TriangleAlert className="h-4 w-4" aria-hidden />
          </button>
        </TooltipTrigger>
        <TooltipContent>{NET_FEE_WARNING}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export function ClientPaidNote() {
  return <span className="text-[11px] text-muted-foreground">Client paid</span>
}

/** Read-only Media and Fee cells for one burst. Does not write the form. */
export function CanonicalBurstMoney({
  budget,
  buyType,
  budgetIncludesFees,
  clientPaysForMedia,
  feePct,
}: {
  budget: unknown
  buyType?: string | null
  budgetIncludesFees?: boolean | null
  clientPaysForMedia?: boolean | null
  feePct: number
}) {
  const shown = displayLineTotals(
    {
      buyType: buyType ?? undefined,
      budgetIncludesFees: budgetIncludesFees === true,
      clientPaysForMedia: clientPaysForMedia === true,
      bursts: [{ budget, buyType: buyType ?? undefined }],
    },
    { feePct: feePct || 0 },
  )

  return (
    <>
      <div className="flex flex-col justify-end gap-0.5">
        <Input
          type="text"
          readOnly
          aria-label="Media"
          className={readoutClass}
          value={formatCents(shown.mediaCents)}
        />
        {shown.clientPaid ? <ClientPaidNote /> : null}
      </div>
      <div className="flex items-center gap-1">
        <Input
          type="text"
          readOnly
          aria-label="Fee"
          className={readoutClass}
          value={formatCents(shown.feeCents)}
        />
        {shown.invalidNetFee ? <NetFeeWarning /> : null}
      </div>
    </>
  )
}
