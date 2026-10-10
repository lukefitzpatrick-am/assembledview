"use client"

import React from "react"
import { StatTile, type StatTileMoneyState } from "@/components/finance/sections/StatTile"
import type { BillingStatCards } from "@/lib/finance/sections/billingPresentation"

type View = "loading" | "error" | "empty" | "ready"

function tileState(view: View, cents: number, errorMessage?: string): StatTileMoneyState {
  if (view === "loading") return { status: "loading" }
  if (view === "error") return { status: "error", message: errorMessage }
  if (view === "empty") return { status: "empty" }
  return { status: "ready", cents }
}

function countCaption(count: number, singular: string, plural: string): string {
  return count === 1 ? `1 ${singular}` : `${count} ${plural}`
}

function draftedCaption(cards: BillingStatCards): string {
  const drafts = countCaption(cards.draftedCount, "draft", "drafts")
  if (cards.draftedDiffersCount <= 0) return drafts
  return cards.draftedDiffersCount === 1 ? `${drafts}, 1 differs` : `${drafts}, ${cards.draftedDiffersCount} differ`
}

export function BillingStatCards({
  view,
  cards,
  errorMessage,
}: {
  view: View
  cards: BillingStatCards
  errorMessage?: string
}) {
  const basis = "Expected billing in the current scope, ex GST."
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatTile
        label="Expected"
        basisCaption={view === "ready" ? countCaption(cards.expectedCount, "invoice", "invoices") : basis}
        state={tileState(view, cards.expectedCents, errorMessage)}
        accent="none"
        valueClassName="text-foreground"
      />
      <StatTile
        label="Drafted in Xero"
        basisCaption={view === "ready" ? draftedCaption(cards) : basis}
        state={tileState(view, cards.draftedCents, errorMessage)}
        accent="none"
        valueClassName="text-foreground"
      />
      <StatTile
        label="Issued and paid"
        basisCaption={
          view === "ready" ? countCaption(cards.issuedPaidCount, "invoice", "invoices") : basis
        }
        state={tileState(view, cards.issuedPaidCents, errorMessage)}
        accent="none"
        valueClassName="text-foreground"
      />
      <StatTile
        label="Overdue"
        basisCaption={view === "ready" ? countCaption(cards.overdueCount, "invoice", "invoices") : basis}
        state={tileState(view, cards.overdueCents, errorMessage)}
        accent="bg-tone-critical"
        valueClassName="text-status-critical-fg"
      />
    </div>
  )
}
