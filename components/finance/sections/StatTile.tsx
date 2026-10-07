"use client"

/**
 * Finance-sections money tile. Four visual states are mutually exclusive:
 * loading | error | empty | ready (including true-zero).
 * A money tile can never render $0.00 while loading or errored.
 */

import React from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { formatMoney } from "@/lib/format/money"
import { cn } from "@/lib/utils"
import type { ViewState } from "@/lib/ui/viewState"

export type StatTileMoneyState =
  | { status: "loading" }
  | { status: "error"; message?: string }
  | { status: "empty" }
  | { status: "ready"; cents: number }

export type StatTileProps = {
  label: string
  /** Mandatory basis / scope caption (July walkthrough pattern). */
  basisCaption: string
  state: StatTileMoneyState
  className?: string
  /** Colour class for the accent dot on ready and empty. `"none"` hides it. */
  accent?: string
  /** Replaces the money figure. Used for a count tile. */
  figure?: string
}

function moneyStateFromViewState(
  vs: ViewState<number> | ViewState<{ cents: number }>
): StatTileMoneyState {
  if (vs.status === "loading") return { status: "loading" }
  if (vs.status === "error") return { status: "error", message: vs.message }
  if (vs.status === "empty" || vs.status === "filtered-empty") return { status: "empty" }
  const data = vs.data
  if (typeof data === "number") return { status: "ready", cents: data }
  return { status: "ready", cents: data.cents }
}

export function statTileStateFromViewState(
  vs: ViewState<number> | ViewState<{ cents: number }>
): StatTileMoneyState {
  return moneyStateFromViewState(vs)
}

export function StatTile({ label, basisCaption, state, className, accent, figure }: StatTileProps) {
  if (state.status === "loading") {
    return (
      <div
        className={cn(
          "overflow-hidden rounded-card border border-border bg-card",
          className
        )}
        aria-busy="true"
      >
        <div className="p-4">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-2 h-8 w-32" />
          <p className="mt-2 text-[11px] text-muted-foreground">{basisCaption}</p>
        </div>
      </div>
    )
  }

  if (state.status === "error") {
    return (
      <div
        role="alert"
        className={cn(
          "overflow-hidden rounded-card border border-pacing-critical-bg bg-pacing-critical-bg",
          className
        )}
      >
        <div className="p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-status-critical-fg">
            {label}
          </p>
          <p className="mt-2 text-sm font-semibold text-status-critical-fg">Unavailable</p>
          <p className="mt-1 text-xs text-status-critical-fg/80">
            {state.message ?? "Could not load this figure."}
          </p>
          <p className="mt-2 text-[11px] text-status-critical-fg/70">{basisCaption}</p>
        </div>
      </div>
    )
  }

  if (state.status === "empty") {
    return (
      <div
        className={cn(
          "overflow-hidden rounded-card border border-dashed border-border bg-surface-panel",
          className
        )}
      >
        <div className="p-4">
          <p className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {accent === "none" ? null : (
              <span
                className={cn("h-[8px] w-[8px] shrink-0 rounded-full", accent ?? "bg-muted-foreground")}
                aria-hidden
              />
            )}
            {label}
          </p>
          <p className="num mt-2 text-[28px] font-extrabold leading-none text-muted-foreground">—</p>
          <p className="mt-2 text-[11px] text-muted-foreground">{basisCaption}</p>
        </div>
      </div>
    )
  }

  // ready — including true zero ($0.00)
  const dollars = state.cents / 100
  return (
    <div
      className={cn(
        "overflow-hidden rounded-card border border-border bg-card",
        className
      )}
    >
      <div className="p-4 pb-3">
        <p className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {accent === "none" ? null : (
            <span
              className={cn("h-[8px] w-[8px] shrink-0 rounded-full", accent ?? "bg-primary")}
              aria-hidden
            />
          )}
          {label}
        </p>
        <p className="num mt-2 text-[28px] font-extrabold leading-none text-primary">
          {figure ?? formatMoney(dollars)}
        </p>
        <p className="mt-2 text-[11px] text-muted-foreground">{basisCaption}</p>
      </div>
    </div>
  )
}
