"use client"

import type { ReactNode } from "react"

import { BillingStateBadge } from "@/components/finance/BillingStateBadge"
import {
  RowActionMenu,
  type RowActionMenuItem,
} from "@/components/finance/RowActionMenu"
import type { BillingState } from "@/lib/finance/billingLifecycle"

export type RowActionLineProps = {
  state?: BillingState
  /** When set, used instead of BillingStateBadge. Still never clickable. */
  pill?: ReactNode
  approvedDrift?: boolean
  reason?: string
  context?: ReactNode
  primary?: ReactNode
  document?: ReactNode
  menuItems?: RowActionMenuItem[]
}

/**
 * Locked finance-row chrome: pill → context → spacer → primary → document → ⋯.
 * Callers pick the contents, not the order.
 */
export function RowActionLine({
  state,
  pill,
  approvedDrift,
  reason,
  context,
  primary,
  document,
  menuItems,
}: RowActionLineProps) {
  const pillNode =
    pill ??
    (state != null ? (
      <BillingStateBadge state={state} approvedDrift={approvedDrift} reason={reason} />
    ) : null)

  return (
    <div
      data-row-action-line=""
      className="flex min-w-0 items-center gap-2"
    >
      {pillNode != null ? (
        <div data-row-action-slot="pill" className="shrink-0">
          {pillNode}
        </div>
      ) : null}
      {context != null && context !== "" ? (
        <div
          data-row-action-slot="context"
          className="truncate text-[11px] text-muted-foreground"
        >
          {context}
        </div>
      ) : null}
      <div data-row-action-slot="spacer" className="min-w-2 flex-1" aria-hidden />
      {primary != null ? (
        <div data-row-action-slot="primary" className="shrink-0">
          {primary}
        </div>
      ) : null}
      {document != null ? (
        <div data-row-action-slot="document" className="shrink-0">
          {document}
        </div>
      ) : null}
      {menuItems && menuItems.length > 0 ? (
        <div data-row-action-slot="menu" className="shrink-0">
          <RowActionMenu items={menuItems} />
        </div>
      ) : null}
    </div>
  )
}
