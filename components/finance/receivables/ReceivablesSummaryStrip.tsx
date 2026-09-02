"use client"

import React from "react"
import { StatTile, type StatTileMoneyState } from "@/components/finance/sections/StatTile"
import {
  INVOICING_FUNNEL_LABELS,
} from "@/lib/finance/sections/invoicingFunnel"
import { cn } from "@/lib/utils"

export type ReceivablesSummaryStripView = "loading" | "error" | "empty" | "ready"

export type ReceivablesSummaryStripProps = {
  view: ReceivablesSummaryStripView
  errorMessage?: string
  readyCents?: number
  approvedCents?: number
  sentToFinanceCents?: number
  readyCaption?: string
  approvedCaption?: string
  sentToFinanceCaption?: string
  className?: string
}

const READY_BASIS = "Ready invoices in the current scope"
const APPROVED_BASIS = "Approved invoices in the current scope"
const SENT_BASIS = "Sent to finance and beyond in the current scope"

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

function captionFor(
  view: ReceivablesSummaryStripView,
  countCaption: string | undefined,
  fallback: string
): string {
  if (view === "ready" && countCaption) return countCaption
  return fallback
}

export function ReceivablesSummaryStrip({
  view,
  errorMessage,
  readyCents = 0,
  approvedCents = 0,
  sentToFinanceCents = 0,
  readyCaption,
  approvedCaption,
  sentToFinanceCaption,
  className,
}: ReceivablesSummaryStripProps) {
  return (
    <div className={cn("grid gap-3 sm:grid-cols-3", className)}>
      <StatTile
        label={INVOICING_FUNNEL_LABELS.ready}
        basisCaption={captionFor(view, readyCaption, READY_BASIS)}
        accent="none"
        state={tileState(view, readyCents, errorMessage)}
      />
      <StatTile
        label={INVOICING_FUNNEL_LABELS.approved}
        basisCaption={captionFor(view, approvedCaption, APPROVED_BASIS)}
        accent="none"
        state={tileState(view, approvedCents, errorMessage)}
      />
      <StatTile
        label={INVOICING_FUNNEL_LABELS.sent_to_finance}
        basisCaption={captionFor(view, sentToFinanceCaption, SENT_BASIS)}
        accent="none"
        state={tileState(view, sentToFinanceCents, errorMessage)}
      />
    </div>
  )
}
