"use client"

/**
 * FIN-2 — single invoicing toolbar (scope + filters).
 * Scope (FY / months / clients) commits on Apply; local filters apply on change.
 * Send to accounts and bulk approve live on the month bar, not in this filter row.
 */

import { SectionScopeBar } from "@/components/finance/sections/SectionScopeBar"
import { InvoicingLocalFiltersBar } from "@/components/finance/sections/invoicing/InvoicingLocalFilters"
import type { InvoicingLocalFilters } from "@/lib/finance/sections/useInvoicingReceivablesData"

type Props = {
  showingLabel?: string
  lastExportLine?: string | null
  localFilters: InvoicingLocalFilters
  onLocalFiltersChange: (next: InvoicingLocalFilters) => void
}

export function InvoicingToolbar({
  showingLabel,
  lastExportLine,
  localFilters,
  onLocalFiltersChange,
}: Props) {
  return (
    <div className="rounded-card border border-border bg-card px-3 py-3 shadow-e1">
      <div className="flex flex-col gap-3">
        <SectionScopeBar showingLabel={showingLabel} />
        {lastExportLine ? (
          <p className="text-xs text-muted-foreground">{lastExportLine}</p>
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
