"use client"

import React from "react"
import { StatTile, type StatTileMoneyState } from "@/components/finance/sections/StatTile"
import { cn } from "@/lib/utils"

export type ReceivablesSummaryStripView = "loading" | "error" | "empty" | "ready"

export type ReceivablesSummaryStripProps = {
  view: ReceivablesSummaryStripView
  errorMessage?: string
  totalToBillCents?: number
  approvedAndBeyondCents?: number
  notYetApprovedCents?: number
  className?: string
}

const TOTAL_TO_BILL_CAPTION = "Composed receivables in the current scope"
const APPROVED_AND_BEYOND_CAPTION = "Any derived state past ready"
const NOT_YET_APPROVED_CAPTION = "Derived state still ready"

function tileState(
  view: ReceivablesSummaryStripView,
  cents: number,
  errorMessage?: string
): StatTileMoneyState {
  if (view === "loading") return { status: "loading" }
  if (view === "error") return { status: "error", message: errorMessage }
  if (view === "empty") return { status: "empty" }
  return { status: "ready", cents }
}

export function ReceivablesSummaryStrip({
  view,
  errorMessage,
  totalToBillCents = 0,
  approvedAndBeyondCents = 0,
  notYetApprovedCents = 0,
  className,
}: ReceivablesSummaryStripProps) {
  return (
    <div className={cn("grid gap-3 sm:grid-cols-3", className)}>
      <StatTile
        label="Total to bill"
        basisCaption={TOTAL_TO_BILL_CAPTION}
        accent="none"
        state={tileState(view, totalToBillCents, errorMessage)}
      />
      <StatTile
        label="Approved & beyond"
        basisCaption={APPROVED_AND_BEYOND_CAPTION}
        accent="none"
        state={tileState(view, approvedAndBeyondCents, errorMessage)}
      />
      <StatTile
        label="Not yet approved"
        basisCaption={NOT_YET_APPROVED_CAPTION}
        accent="none"
        state={tileState(view, notYetApprovedCents, errorMessage)}
      />
    </div>
  )
}
