"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { addMonths, format, startOfMonth } from "date-fns"
import { MultiSelectCombobox } from "@/components/ui/multi-select-combobox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { useFinanceStore, type FinanceHubTab } from "@/lib/finance/useFinanceStore"
import {
  billingTypeOptionsForTab,
  mergeTabSelection,
  statusOptionsForTab,
  tabOwnedSelection,
  tabSelectionMeansAll,
  RECEIVABLE_BILLING_TYPES,
} from "@/lib/finance/financeTabFilterScope"
import type { BillingStatus, BillingType, FinanceFilters } from "@/lib/types/financeBilling"

type RangeMode = "single" | "range"

type ClientOption = { value: string; label: string }

type PublisherOption = { value: string; label: string }

export type FinanceFilterToolbarReceivablesProps = {
  synced: boolean
  loading: boolean
  bump: () => void
}

type FinanceFilterToolbarProps = {
  /** When set (e.g. finance hub Receivables tab), Load/Refresh receivables uses the same control row as filter apply. */
  receivables?: FinanceFilterToolbarReceivablesProps | null
  /** Drives which billing-type / status options are offered — never a superset of what the tab can consume. */
  activeTab: FinanceHubTab
}

const BILLING_TYPE_LABELS: Record<(typeof RECEIVABLE_BILLING_TYPES)[number], string> = {
  media: "Media",
  sow: "SOW",
  retainer: "Retainer",
}

const STATUS_LABELS: Record<BillingStatus, string> = {
  draft: "Draft",
  booked: "Booked",
  approved: "Approved",
  invoiced: "Invoiced",
  paid: "Paid",
  cancelled: "Cancelled",
  expected: "Expected",
  disputed: "Disputed",
}

function monthOptions() {
  const current = startOfMonth(new Date())
  return Array.from({ length: 37 }, (_, i) => {
    const d = addMonths(current, i - 24)
    return { value: format(d, "yyyy-MM"), label: format(d, "MMMM yyyy") }
  })
}

export function FinanceFilterToolbar({ receivables, activeTab }: FinanceFilterToolbarProps) {
  const storeFilters = useFinanceStore((s) => s.filters)
  const setFilters = useFinanceStore((s) => s.setFilters)
  const [draft, setDraft] = useState<FinanceFilters>(() => storeFilters)
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  const months = useMemo(() => monthOptions(), [])
  const [clientOptions, setClientOptions] = useState<ClientOption[]>([])
  const [publisherOptions, setPublisherOptions] = useState<PublisherOption[]>([])
  const [rangeMode, setRangeMode] = useState<RangeMode>(() =>
    storeFilters.monthRange.from === storeFilters.monthRange.to ? "single" : "range"
  )
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    setDraft(storeFilters)
  }, [storeFilters])

  useEffect(() => {
    const single = draft.monthRange.from === draft.monthRange.to
    setRangeMode(single ? "single" : "range")
  }, [draft.monthRange.from, draft.monthRange.to])

  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(storeFilters),
    [draft, storeFilters]
  )

  useEffect(() => {
    const load = async () => {
      try {
        const [clientsRes, publishersRes] = await Promise.all([
          fetch("/api/clients"),
          fetch("/api/publishers"),
        ])
        if (clientsRes.ok) {
          const data = await clientsRes.json()
          const options = (Array.isArray(data) ? data : [])
            .map((c: Record<string, unknown>) => ({
              value: String(c.id),
              label: String(c.mp_client_name || c.clientname_input || c.name || `Client ${c.id}`),
            }))
            .sort((a: ClientOption, b: ClientOption) => a.label.localeCompare(b.label))
          setClientOptions(options)
        }
        if (publishersRes.ok) {
          const data = await publishersRes.json()
          const options = (Array.isArray(data) ? data : [])
            .map((p: Record<string, unknown>) => ({
              value: String(p.id),
              label: String(p.publisher_name || `Publisher ${p.id}`),
            }))
            .sort((a: PublisherOption, b: PublisherOption) => a.label.localeCompare(b.label))
          setPublisherOptions(options)
        }
      } catch {
        setClientOptions([])
        setPublisherOptions([])
      }
    }
    void load()
  }, [])

  const onRangeModeChange = useCallback((mode: RangeMode) => {
    setRangeMode(mode)
    setDraft((d) => {
      if (mode === "single") {
        return { ...d, monthRange: { from: d.monthRange.from, to: d.monthRange.from } }
      }
      const to =
        d.monthRange.to < d.monthRange.from ? d.monthRange.from : d.monthRange.to
      return { ...d, monthRange: { from: d.monthRange.from, to } }
    })
  }, [])

  const applyDraft = useCallback(() => {
    setFilters(draft)
  }, [draft, setFilters])

  const applyDraftThenReceivables = useCallback(() => {
    setFilters(draft)
    if (receivables) {
      window.setTimeout(() => {
        receivables.bump()
      }, 0)
    }
  }, [draft, receivables, setFilters])

  const publisherValues = useMemo(
    () => draft.selectedPublishers.map(String),
    [draft.selectedPublishers]
  )

  const tabBillingTypes = useMemo(() => billingTypeOptionsForTab(activeTab), [activeTab])
  const tabStatuses = useMemo(() => statusOptionsForTab(activeTab), [activeTab])

  const billingTypeOptions = useMemo(
    () =>
      tabBillingTypes.map((value) => ({
        value,
        label: BILLING_TYPE_LABELS[value as (typeof RECEIVABLE_BILLING_TYPES)[number]],
      })),
    [tabBillingTypes]
  )
  const statusOptions = useMemo(
    () =>
      tabStatuses.map((value) => ({
        value,
        label: STATUS_LABELS[value],
      })),
    [tabStatuses]
  )
  const billingTypeValues = useMemo(
    () => tabOwnedSelection(draft.billingTypes, tabBillingTypes),
    [draft.billingTypes, tabBillingTypes]
  )
  const statusValues = useMemo(
    () => tabOwnedSelection(draft.statuses, tabStatuses),
    [draft.statuses, tabStatuses]
  )
  /**
   * An empty tab-owned selection only means "All" when nothing at all is
   * applied — with out-of-tab values still filtering, claiming "All" would lie.
   */
  const billingTypeMeansAll = tabSelectionMeansAll(draft.billingTypes)
  const statusMeansAll = tabSelectionMeansAll(draft.statuses)

  const toolbarActions = (
    <div className="flex items-center justify-end gap-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={!dirty}
        title={dirty ? "Discard draft filter changes" : "No unapplied filter changes to reset"}
        onClick={() => setDraft(storeFilters)}
      >
        Reset
      </Button>
      {receivables ? (
        receivables.loading ? (
          <Button type="button" size="sm" disabled title="Loading receivables…">
            Loading…
          </Button>
        ) : dirty ? (
          <Button
            type="button"
            size="sm"
            onClick={applyDraftThenReceivables}
            className="ring-2 ring-primary/30"
          >
            Load
          </Button>
        ) : !receivables.synced ? (
          <Button type="button" size="sm" onClick={() => receivables.bump()}>
            Load
          </Button>
        ) : (
          <Button type="button" size="sm" variant="outline" onClick={() => receivables.bump()}>
            Refresh
          </Button>
        )
      ) : dirty ? (
        <Button
          type="button"
          size="sm"
          onClick={applyDraft}
          className="ring-2 ring-primary/30"
        >
          Load
        </Button>
      ) : (
        <span
          role="status"
          className="inline-flex h-9 items-center rounded-md border border-border bg-muted/40 px-3 text-sm text-muted-foreground"
        >
          Loaded
        </span>
      )}
    </div>
  )

  const controls = (
    <>
      <div className="flex flex-col gap-2 lg:col-span-3">
        <Label
          htmlFor="finance-filter-clients"
          className="text-xs font-medium text-muted-foreground"
        >
          Clients
        </Label>
        <MultiSelectCombobox
          id="finance-filter-clients"
          options={clientOptions}
          values={draft.selectedClients}
          onValuesChange={(values) =>
            setDraft((d) => ({ ...d, selectedClients: values }))
          }
          placeholder="Clients"
          allSelectedText="All clients"
          searchPlaceholder="Search clients..."
          buttonClassName="w-full"
          emptyMeansAll
        />
      </div>
      <div className="flex flex-col gap-2 lg:col-span-3">
        <Label
          htmlFor="finance-filter-publishers"
          className="text-xs font-medium text-muted-foreground"
        >
          Publishers
        </Label>
        <MultiSelectCombobox
          id="finance-filter-publishers"
          options={publisherOptions}
          values={publisherValues}
          onValuesChange={(values) =>
            setDraft((d) => ({
              ...d,
              selectedPublishers: values.map((v) => Number(v)).filter((n) => Number.isFinite(n)),
            }))
          }
          placeholder="Publishers"
          allSelectedText="All publishers"
          searchPlaceholder="Search publishers..."
          buttonClassName="w-full"
          emptyMeansAll
        />
      </div>
      {billingTypeOptions.length > 0 ? (
        <div className="flex flex-col gap-2 lg:col-span-2">
          <Label
            htmlFor="finance-filter-billing-type"
            className="text-xs font-medium text-muted-foreground"
          >
            Billing type
          </Label>
          <MultiSelectCombobox
            id="finance-filter-billing-type"
            options={billingTypeOptions}
            values={billingTypeValues}
            onValuesChange={(values) =>
              setDraft((d) => ({
                ...d,
                billingTypes: mergeTabSelection(
                  values as BillingType[],
                  d.billingTypes,
                  tabBillingTypes
                ),
              }))
            }
            placeholder="Billing type"
            allSelectedText="All types"
            searchPlaceholder="Search types..."
            buttonClassName="w-full"
            emptyMeansAll={billingTypeMeansAll}
          />
        </div>
      ) : null}
      {statusOptions.length > 0 ? (
        <div className="flex flex-col gap-2 lg:col-span-2">
          <Label htmlFor="finance-filter-status" className="text-xs font-medium text-muted-foreground">
            Status
          </Label>
          <MultiSelectCombobox
            id="finance-filter-status"
            options={statusOptions}
            values={statusValues}
            onValuesChange={(values) =>
              setDraft((d) => ({
                ...d,
                statuses: mergeTabSelection(values as BillingStatus[], d.statuses, tabStatuses),
              }))
            }
            placeholder="Status"
            allSelectedText="All statuses"
            searchPlaceholder="Search statuses..."
            buttonClassName="w-full"
            emptyMeansAll={statusMeansAll}
          />
        </div>
      ) : null}
      <div className="flex flex-col gap-2 lg:col-span-2">
        <Label htmlFor="finance-hub-search" className="text-xs font-medium text-muted-foreground">
          Search
        </Label>
        <Input
          id="finance-hub-search"
          ref={searchInputRef}
          value={draft.searchQuery}
          onChange={(e) => setDraft((d) => ({ ...d, searchQuery: e.target.value }))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              setFilters(draft)
              if (receivables) {
                window.setTimeout(() => {
                  receivables.bump()
                }, 0)
              }
            }
          }}
          placeholder="Search…"
          className="focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      <div className="flex flex-col gap-2 lg:col-span-4">
        <span className="text-xs font-medium text-muted-foreground">Billing month</span>
        <div className="flex flex-wrap gap-2">
          <Select value={rangeMode} onValueChange={(v: RangeMode) => onRangeModeChange(v)}>
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="single">Single</SelectItem>
              <SelectItem value="range">Range</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={draft.monthRange.from}
            onValueChange={(from) => {
              setDraft((d) => {
                if (rangeMode === "single") {
                  return { ...d, monthRange: { from, to: from } }
                }
                const to = d.monthRange.to < from ? from : d.monthRange.to
                return { ...d, monthRange: { from, to } }
              })
            }}
          >
            <SelectTrigger className="min-w-[160px] flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {months.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {rangeMode === "range" && (
            <Select
              value={draft.monthRange.to}
              onValueChange={(to) => {
                setDraft((d) => {
                  const from = to < d.monthRange.from ? to : d.monthRange.from
                  return { ...d, monthRange: { from, to } }
                })
              }}
            >
              <SelectTrigger className="min-w-[160px] flex-1">
                <SelectValue placeholder="To" />
              </SelectTrigger>
              <SelectContent>
                {months.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2 lg:col-span-2">
        <Label htmlFor="finance-include-drafts" className="text-sm font-normal">
          Include drafts
        </Label>
        <Switch
          id="finance-include-drafts"
          checked={draft.includeDrafts}
          onCheckedChange={(checked) => setDraft((d) => ({ ...d, includeDrafts: checked }))}
          aria-label="Include drafts"
        />
      </div>
    </>
  )

  return (
    <div className="border-b border-border/50 bg-background/95 py-3 backdrop-blur">
      <div className="mb-3 flex flex-wrap items-center justify-end gap-2 lg:hidden">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm">
              Filters
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="h-[min(85vh,640px)]">
            <SheetHeader>
              <SheetTitle>Filters</SheetTitle>
              <SheetDescription className="sr-only">Filter finance records.</SheetDescription>
            </SheetHeader>
            <div className="mt-4 grid grid-cols-1 gap-4">
              {controls}
              <div className="pt-2">{toolbarActions}</div>
            </div>
          </SheetContent>
        </Sheet>
        {toolbarActions}
      </div>
      <div className="hidden grid-cols-1 gap-3 lg:grid lg:grid-cols-12">
        {controls}
        <div className="flex items-end justify-end lg:col-span-12">{toolbarActions}</div>
      </div>
    </div>
  )
}
