"use client"

/**
 * FIN-2 — single invoicing toolbar (scope + filters).
 * Scope (FY / months / clients) commits on Apply; local filters apply on change.
 * Send to accounts and bulk approve live on the month bar, not in this filter row.
 * Review downloads (Download Excel / CSV) sit beside the last-sent line; they never stamp.
 */

import type { ReactNode } from "react"

import { SectionScopeBar } from "@/components/finance/sections/SectionScopeBar"
import { InvoicingLocalFiltersBar } from "@/components/finance/sections/invoicing/InvoicingLocalFilters"
import type { InvoicingLocalFilters } from "@/lib/finance/sections/useInvoicingReceivablesData"

type Props = {
  showingLabel?: string
  lastExportLine?: string | null
  /** Review downloads for the rows shown. Read-only. */
  downloadActions?: ReactNode
  localFilters: InvoicingLocalFilters
  onLocalFiltersChange: (next: InvoicingLocalFilters) => void
}

export function InvoicingToolbar({
  showingLabel,
  lastExportLine,
  downloadActions,
  localFilters,
  onLocalFiltersChange,
}: Props) {
  return (
    <div className="rounded-card border border-border bg-card px-3 py-3 shadow-e1">
      <div className="flex flex-col gap-3">
        <SectionScopeBar showingLabel={showingLabel} />
        {lastExportLine || downloadActions ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            {lastExportLine ? (
              <p className="text-xs text-muted-foreground">{lastExportLine}</p>
            ) : (
              <span />
            )}
            {downloadActions ? (
              <div className="flex flex-wrap items-center gap-2">{downloadActions}</div>
            ) : null}
          </div>
        ) : null}
        <div className="border-t border-border pt-3">
          <InvoicingLocalFiltersBar
            framed={false}
            value={localFilters}
            onChange={onLocalFiltersChange}
          />
        </div>
      </div>
    </div>
  )
}
