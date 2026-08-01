"use client"

/**
 * FIN-2 — single invoicing toolbar (scope + filters + exports).
 * Scope (FY / months / clients) commits on Apply; local filters apply on change.
 */

import { SectionScopeBar } from "@/components/finance/sections/SectionScopeBar"
import { InvoicingLocalFiltersBar } from "@/components/finance/sections/invoicing/InvoicingLocalFilters"
import type { InvoicingLocalFilters } from "@/lib/finance/sections/useInvoicingReceivablesData"

type Props = {
  showingLabel?: string
  localFilters: InvoicingLocalFilters
  onLocalFiltersChange: (next: InvoicingLocalFilters) => void
  onExportExcel?: () => void
  onExportCsv?: () => void
  exportDisabled?: boolean
}

export function InvoicingToolbar({
  showingLabel,
  localFilters,
  onLocalFiltersChange,
  onExportExcel,
  onExportCsv,
  exportDisabled,
}: Props) {
  return (
    <div className="rounded-card border border-border bg-card px-3 py-3 shadow-e1">
      <div className="flex flex-col gap-3">
        <SectionScopeBar showingLabel={showingLabel} />
        <div className="border-t border-border pt-3">
          <InvoicingLocalFiltersBar
            framed={false}
            value={localFilters}
            onChange={onLocalFiltersChange}
            onExportCsv={onExportCsv}
            onExportExcel={onExportExcel}
            exportDisabled={exportDisabled}
          />
        </div>
      </div>
    </div>
  )
}
