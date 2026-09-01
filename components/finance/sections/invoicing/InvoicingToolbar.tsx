"use client"

/**
 * FIN-2 — single invoicing toolbar (scope + filters + exports).
 * Scope (FY / months / clients) commits on Apply; local filters apply on change.
 */

import { MarkSentToFinanceButton } from "@/components/finance/sections/invoicing/MarkSentToFinanceButton"
import { SectionScopeBar } from "@/components/finance/sections/SectionScopeBar"
import { InvoicingLocalFiltersBar } from "@/components/finance/sections/invoicing/InvoicingLocalFilters"
import type { InvoicingLocalFilters } from "@/lib/finance/sections/useInvoicingReceivablesData"

type Props = {
  showingLabel?: string
  lastExportLine?: string | null
  localFilters: InvoicingLocalFilters
  onLocalFiltersChange: (next: InvoicingLocalFilters) => void
  onExportExcel?: () => void
  onExportCsv?: () => void
  csvDisabled?: boolean
  excelDisabled?: boolean
  excelDisabledReason?: string
  onApproveReady?: () => void
  approveReadyCount?: number
  approveBusy?: boolean
  onMarkSentToFinance?: () => void
  markSentDisabled?: boolean
  markSentBusy?: boolean
}

export function InvoicingToolbar({
  showingLabel,
  lastExportLine,
  localFilters,
  onLocalFiltersChange,
  onExportExcel,
  onExportCsv,
  csvDisabled,
  excelDisabled,
  excelDisabledReason,
  onApproveReady,
  approveReadyCount = 0,
  approveBusy,
  onMarkSentToFinance,
  markSentDisabled,
  markSentBusy,
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
            onExportCsv={onExportCsv}
            onExportExcel={onExportExcel}
            csvDisabled={csvDisabled}
            excelDisabled={excelDisabled}
            excelDisabledReason={excelDisabledReason}
            onApproveReady={onApproveReady}
            approveReadyCount={approveReadyCount}
            approveBusy={approveBusy}
            markSentButton={
              onMarkSentToFinance ? (
                <MarkSentToFinanceButton
                  disabled={markSentDisabled}
                  busy={markSentBusy}
                  onConfirm={onMarkSentToFinance}
                />
              ) : null
            }
          />
        </div>
      </div>
    </div>
  )
}
