"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { addMonths, format, startOfMonth } from "date-fns"
import { MultiSelectCombobox } from "@/components/ui/multi-select-combobox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { useFinanceStore } from "@/lib/finance/useFinanceStore"
import type { FinanceFilters } from "@/lib/types/financeBilling"
import { cn } from "@/lib/utils"

type RangeMode = "single" | "range"

type ClientOption = { value: string; label: string }

type PublisherOption = { value: string; label: string }

function monthOptions() {
  const current = startOfMonth(new Date())
  return Array.from({ length: 37 }, (_, i) => {
    const d = addMonths(current, i - 24)
    return { value: format(d, "yyyy-MM"), label: format(d, "MMMM yyyy") }
  })
}

export function FinanceFilterToolbar() {
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

  const publisherValues = useMemo(
    () => draft.selectedPublishers.map(String),
    [draft.selectedPublishers]
  )

  const toolbarActions = (
    <div className="flex items-center justify-end gap-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={!dirty}
        onClick={() => setDraft(storeFilters)}
      >
        Reset
      </Button>
      <Button
        type="button"
        size="sm"
        disabled={!dirty}
        onClick={applyDraft}
        className={cn(dirty && "ring-2 ring-primary/30")}
      >
        {dirty ? "Load" : "Loaded"}
      </Button>
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
