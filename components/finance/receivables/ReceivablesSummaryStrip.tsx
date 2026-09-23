"use client"

import React from "react"
import { StatTile, type StatTileMoneyState } from "@/components/finance/sections/StatTile"
import {
  INVOICING_FUNNEL_LABELS,
  type InvoicingFunnelBucketId,
  type InvoicingLifecycleFilter,
} from "@/lib/finance/sections/invoicingFunnel"
import { cn } from "@/lib/utils"

export type ReceivablesSummaryStripView = "loading" | "error" | "empty" | "ready"

export type ReceivablesSummaryStripProps = {
  view: ReceivablesSummaryStripView
  errorMessage?: string
  readyCents?: number
  approvedCents?: number
  sentToFinanceCents?: number
  issuedOutsideCents?: number
  needsAttentionCount?: number
  readyCaption?: string
  approvedCaption?: string
  sentToFinanceCaption?: string
  issuedOutsideCaption?: string
  className?: string
  /** When set with onFilterChange, tiles become lifecycle filters. */
  selectedFilter?: InvoicingLifecycleFilter
  onFilterChange?: (next: InvoicingLifecycleFilter) => void
}

const READY_BASIS = "Ready invoices in the current scope"
const APPROVED_BASIS = "Approved invoices in the current scope"
const SENT_BASIS = "Sent to finance and beyond in the current scope"
const ISSUED_OUTSIDE_BASIS = "Matched in Xero with no approval in Assembled View"
const NEEDS_ATTENTION_BASIS = "Matched invoices whose amount differs by more than $1"

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

function FilterWrap({
  filterId,
  selected,
  onSelect,
  children,
}: {
  filterId: InvoicingFunnelBucketId
  selected: InvoicingLifecycleFilter | undefined
  onSelect?: (next: InvoicingLifecycleFilter) => void
  children: React.ReactNode
}) {
  if (!onSelect) return <>{children}</>
  const pressed = selected === filterId
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={() => onSelect(filterId)}
      className={cn(
        "interactive w-full rounded-card text-left",
        pressed && "ring-2 ring-ring"
      )}
    >
      {children}
    </button>
  )
}

export function ReceivablesSummaryStrip({
  view,
  errorMessage,
  readyCents = 0,
  approvedCents = 0,
  sentToFinanceCents = 0,
  issuedOutsideCents = 0,
  needsAttentionCount = 0,
  readyCaption,
  approvedCaption,
  sentToFinanceCaption,
  issuedOutsideCaption,
  className,
  selectedFilter,
  onFilterChange,
}: ReceivablesSummaryStripProps) {
  return (
    <div className={cn("space-y-2", className)}>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <FilterWrap filterId="ready" selected={selectedFilter} onSelect={onFilterChange}>
          <StatTile
            label={INVOICING_FUNNEL_LABELS.ready}
            basisCaption={captionFor(view, readyCaption, READY_BASIS)}
            accent="none"
            state={tileState(view, readyCents, errorMessage)}
          />
        </FilterWrap>
        <FilterWrap filterId="approved" selected={selectedFilter} onSelect={onFilterChange}>
          <StatTile
            label={INVOICING_FUNNEL_LABELS.approved}
            basisCaption={captionFor(view, approvedCaption, APPROVED_BASIS)}
            accent="none"
            state={tileState(view, approvedCents, errorMessage)}
          />
        </FilterWrap>
        <FilterWrap
          filterId="sent_to_finance"
          selected={selectedFilter}
          onSelect={onFilterChange}
        >
          <StatTile
            label={INVOICING_FUNNEL_LABELS.sent_to_finance}
            basisCaption={captionFor(view, sentToFinanceCaption, SENT_BASIS)}
            accent="none"
            state={tileState(view, sentToFinanceCents, errorMessage)}
          />
        </FilterWrap>
        <FilterWrap
          filterId="issued_outside_av"
          selected={selectedFilter}
          onSelect={onFilterChange}
        >
          <StatTile
            label={INVOICING_FUNNEL_LABELS.issued_outside_av}
            basisCaption={captionFor(view, issuedOutsideCaption, ISSUED_OUTSIDE_BASIS)}
            accent="none"
            state={tileState(view, issuedOutsideCents, errorMessage)}
          />
        </FilterWrap>
        <StatTile
          label="Needs attention"
          basisCaption={NEEDS_ATTENTION_BASIS}
          accent="none"
          figure={view === "ready" ? String(needsAttentionCount) : undefined}
          state={
            view === "ready"
              ? { status: "ready", cents: 0 }
              : tileState(view, 0, errorMessage)
          }
        />
      </div>
      {onFilterChange ? (
        <button
          type="button"
          aria-pressed={selectedFilter === "all"}
          onClick={() => onFilterChange("all")}
          className={cn(
            "interactive rounded-input px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground",
            selectedFilter === "all" && "ring-2 ring-ring text-foreground"
          )}
        >
          All
        </button>
      ) : null}
    </div>
  )
}
