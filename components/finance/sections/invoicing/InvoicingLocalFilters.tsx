"use client"

/**
 * Status + billing-type (+ search / publishers / drafts / exports).
 * Scope FY/months/clients live in SectionScopeBar (Apply-gated).
 * Filters here apply on change (FN-series auto-load — do not regress).
 */

import { useEffect, useMemo, useState, type ReactNode } from "react"
import { MultiSelectCombobox } from "@/components/ui/multi-select-combobox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import {
  RECEIVABLE_BILLING_TYPES,
  RECEIVABLE_STATUSES,
} from "@/lib/finance/financeTabFilterScope"
import type { BillingStatus, BillingType } from "@/lib/types/financeBilling"
import type { InvoicingLocalFilters } from "@/lib/finance/sections/useInvoicingReceivablesData"
import { coalescedGetJson } from "@/lib/api/coalescedGetJson"
import { cn } from "@/lib/utils"

const BILLING_TYPE_LABELS: Record<(typeof RECEIVABLE_BILLING_TYPES)[number], string> = {
  media: "Media",
  sow: "SOW / Fees",
  retainer: "Retainer",
}

const STATUS_LABELS: Record<(typeof RECEIVABLE_STATUSES)[number], string> = {
  booked: "Booked",
  approved: "Approved",
  invoiced: "Invoiced",
  paid: "Paid",
}

type Props = {
  value: InvoicingLocalFilters
  onChange: (next: InvoicingLocalFilters) => void
  onExportExcel?: () => void
  onExportCsv?: () => void
  csvDisabled?: boolean
  excelDisabled?: boolean
  excelDisabledReason?: string
  markSentButton?: ReactNode
  /** When false, render field row only (parent owns the card — FIN-2 toolbar). */
  framed?: boolean
}

export function InvoicingLocalFiltersBar({
  value,
  onChange,
  onExportExcel,
  onExportCsv,
  csvDisabled,
  excelDisabled,
  excelDisabledReason,
  markSentButton,
  framed = true,
}: Props) {
  const [publisherOptions, setPublisherOptions] = useState<
    Array<{ value: string; label: string }>
  >([])

  useEffect(() => {
    let cancelled = false
    void coalescedGetJson<Array<{ id: number; name?: string; publisher_name?: string }>>(
      "/api/publishers"
    )
      .then((rows) => {
        if (cancelled || !Array.isArray(rows)) return
        setPublisherOptions(
          rows
            .map((p) => ({
              value: String(p.id),
              label: (p.publisher_name || p.name || `Publisher ${p.id}`).trim(),
            }))
            .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }))
        )
      })
      .catch(() => {
        if (!cancelled) setPublisherOptions([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  const billingTypeOptions = useMemo(
    () =>
      RECEIVABLE_BILLING_TYPES.map((value) => ({
        value,
        label: BILLING_TYPE_LABELS[value],
      })),
    []
  )
  const statusOptions = useMemo(
    () =>
      RECEIVABLE_STATUSES.map((value) => ({
        value,
        label: STATUS_LABELS[value],
      })),
    []
  )

  const fields = (
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-[160px] space-y-1">
        <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
          Billing type
        </Label>
        <MultiSelectCombobox
          options={billingTypeOptions}
          values={value.billingTypes}
          onValuesChange={(values) =>
            onChange({ ...value, billingTypes: values as BillingType[] })
          }
          placeholder="Billing type"
          allSelectedText="All types"
          emptyMeansAll
          selectAllText="All types"
        />
      </div>
      <div className="min-w-[160px] space-y-1">
        <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
          Status
        </Label>
        <MultiSelectCombobox
          options={statusOptions}
          values={value.statuses}
          onValuesChange={(values) =>
            onChange({ ...value, statuses: values as BillingStatus[] })
          }
          placeholder="Status"
          allSelectedText="All statuses"
          emptyMeansAll
          selectAllText="All statuses"
        />
      </div>
      <div className="min-w-[180px] flex-1 space-y-1">
        <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
          Publishers
        </Label>
        <MultiSelectCombobox
          options={publisherOptions}
          values={value.selectedPublishers.map(String)}
          onValuesChange={(values) =>
            onChange({
              ...value,
              selectedPublishers: values
                .map((v) => Number.parseInt(v, 10))
                .filter((n) => Number.isFinite(n)),
            })
          }
          placeholder="All publishers"
          allSelectedText="All publishers"
          emptyMeansAll
          selectAllText="All publishers"
        />
      </div>
      <div className="min-w-[160px] flex-1 space-y-1">
        <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
          Search
        </Label>
        <Input
          value={value.searchQuery}
          onChange={(e) => onChange({ ...value, searchQuery: e.target.value })}
          placeholder="MBA, campaign…"
          className="h-9"
        />
      </div>
      <div className="flex items-center gap-2 pb-1">
        <Switch
          id="invoicing-include-drafts"
          aria-labelledby="invoicing-include-drafts-label"
          checked={value.includeDrafts}
          onCheckedChange={(checked) => onChange({ ...value, includeDrafts: checked })}
        />
        <Label
          id="invoicing-include-drafts-label"
          htmlFor="invoicing-include-drafts"
          className="text-xs text-muted-foreground"
        >
          Include drafts
        </Label>
      </div>
      <div className="ml-auto flex items-center gap-2 pb-0.5">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={csvDisabled}
          onClick={onExportCsv}
        >
          CSV
        </Button>
        {excelDisabled && excelDisabledReason ? (
          <span title={excelDisabledReason} className="inline-flex">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled
              aria-label={`Excel. ${excelDisabledReason}`}
            >
              Excel
            </Button>
          </span>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={excelDisabled}
            onClick={onExportExcel}
          >
            Excel
          </Button>
        )}
        {markSentButton}
      </div>
    </div>
  )

  if (!framed) return fields

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-card border border-border bg-card px-3 py-3 shadow-e1"
      )}
    >
      {fields}
    </div>
  )
}
