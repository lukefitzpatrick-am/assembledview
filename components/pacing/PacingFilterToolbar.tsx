"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { format, parseISO } from "date-fns"
import type { DateRange } from "react-day-picker"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { MultiSelectCombobox } from "@/components/ui/multi-select-combobox"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { usePacingFilterStore, usePacingFilterStoreApi } from "@/lib/pacing/usePacingFilterStore"
import {
  PACING_MEDIA_TYPE_OPTIONS,
  PACING_STATUS_OPTIONS,
} from "@/lib/pacing/pacingFilters"
import { createDefaultPacingFilters, type PacingFilterState } from "@/lib/pacing/usePacingFilterStore"

type ClientOption = { value: string; label: string }

function pacingFilterStateEqual(a: PacingFilterState, b: PacingFilterState): boolean {
  return (
    a.date_from === b.date_from &&
    a.date_to === b.date_to &&
    a.search === b.search &&
    a.client_ids.join("\0") === b.client_ids.join("\0") &&
    a.media_types.join("\0") === b.media_types.join("\0") &&
    a.statuses.join("\0") === b.statuses.join("\0")
  )
}

function buildPacingSearchParams(f: PacingFilterState): URLSearchParams {
  const p = new URLSearchParams()
  if (f.client_ids.length > 0) p.set("clients", f.client_ids.join(","))
  if (f.media_types.length > 0) p.set("media", f.media_types.join(","))
  if (f.statuses.length > 0) p.set("status", f.statuses.join(","))
  p.set("from", f.date_from)
  p.set("to", f.date_to)
  if (f.search.trim()) p.set("q", f.search.trim())
  return p
}

function stateFromSearchParams(sp: URLSearchParams): PacingFilterState {
  const base = createDefaultPacingFilters()
  const from = sp.get("from")
  const to = sp.get("to")
  return {
    client_ids: sp.has("clients")
      ? (sp.get("clients") || "").split(",").filter(Boolean)
      : [],
    media_types: sp.has("media") ? (sp.get("media") || "").split(",").filter(Boolean) : [],
    statuses: sp.has("status") ? (sp.get("status") || "").split(",").filter(Boolean) : [],
    date_from: from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : base.date_from,
    date_to: to && /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : base.date_to,
    search: sp.get("q")?.trim() ?? "",
  }
}

export function PacingFilterToolbar() {
  const router = useRouter()
  const pathname = usePathname() ?? ""
  const searchParams = useSearchParams() ?? new URLSearchParams()
  const store = usePacingFilterStoreApi()

  const filters = usePacingFilterStore((s) => s.filters)
  const setFilters = usePacingFilterStore((s) => s.setFilters)
  const setFiltersState = usePacingFilterStore((s) => s.setFiltersState)
  const resetToDefaults = usePacingFilterStore((s) => s.resetToDefaults)
  const assignedClientIds = usePacingFilterStore((s) => s.assignedClientIds)

  const [clientOptions, setClientOptions] = useState<ClientOption[]>([])
  const [mobileOpen, setMobileOpen] = useState(false)

  const isScopedTenant = assignedClientIds.length > 0

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/clients")
        if (!res.ok) return
        const data = await res.json()
        let options = (Array.isArray(data) ? data : [])
          .map((c: Record<string, unknown>) => ({
            value: String(c.id),
            label: String(c.mp_client_name || c.clientname_input || c.name || `Client ${c.id}`),
          }))
          .sort((a: ClientOption, b: ClientOption) => a.label.localeCompare(b.label))
        if (isScopedTenant) {
          const allow = new Set(assignedClientIds)
          options = options.filter((o) => allow.has(o.value))
        }
        setClientOptions(options)
      } catch {
        setClientOptions([])
      }
    }
    void load()
  }, [isScopedTenant, assignedClientIds])

  const rangeValue = useMemo((): DateRange | undefined => {
    try {
      const from = parseISO(filters.date_from)
      const to = parseISO(filters.date_to)
      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return undefined
      return { from, to }
    } catch {
      return undefined
    }
  }, [filters.date_from, filters.date_to])

  useEffect(() => {
    const next = stateFromSearchParams(new URLSearchParams(searchParams.toString()))
    const cur = store.getState().filters
    if (pacingFilterStateEqual(cur, next)) return
    setFiltersState(next)
  }, [searchParams, setFiltersState, store])

  useEffect(() => {
    const params = buildPacingSearchParams(filters)
    const qs = params.toString()
    const current = searchParams.toString()
    if (current === qs) return
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [filters, pathname, router, searchParams])

  const onRangeChange = useCallback(
    (next: DateRange | undefined) => {
      if (!next?.from) return
      const to = next.to ?? next.from
      setFilters({
        date_from: format(next.from, "yyyy-MM-dd"),
        date_to: format(to, "yyyy-MM-dd"),
      })
    },
    [setFilters]
  )

  const mediaOptions = useMemo(
    () => PACING_MEDIA_TYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
    []
  )

  const statusOptions = useMemo(
    () => PACING_STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
    []
  )

  const onReset = useCallback(() => {
    resetToDefaults()
    router.replace(pathname, { scroll: false })
  }, [pathname, resetToDefaults, router])

  const sheetControls = (
    <>
      <div>
        <MultiSelectCombobox
          options={clientOptions}
          values={filters.client_ids}
          onValuesChange={(values) => setFilters({ client_ids: values })}
          placeholder="Clients"
          allSelectedText={isScopedTenant ? "All my clients" : "All clients"}
          searchPlaceholder="Search clients…"
          buttonClassName="w-full"
          emptyMeansAll
        />
      </div>
      <div>
        <MultiSelectCombobox
          options={mediaOptions}
          values={filters.media_types}
          onValuesChange={(values) => setFilters({ media_types: values })}
          placeholder="Media type"
          allSelectedText="All media types"
          searchPlaceholder="Search…"
          buttonClassName="w-full"
          emptyMeansAll
        />
      </div>
      <div>
        <MultiSelectCombobox
          options={statusOptions}
          values={filters.statuses}
          onValuesChange={(values) => setFilters({ statuses: values })}
          placeholder="Status"
          allSelectedText="All statuses"
          searchPlaceholder="Search…"
          buttonClassName="w-full"
          emptyMeansAll
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs font-medium text-muted-foreground">Date range</Label>
        <DateRangePicker
          value={rangeValue}
          onChange={onRangeChange}
          displayFormat="dd MMM yyyy"
          className="max-w-full"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="pacing-toolbar-search-mobile" className="text-xs font-medium text-muted-foreground">
          Search
        </Label>
        <Input
          id="pacing-toolbar-search-mobile"
          value={filters.search}
          onChange={(e) => setFilters({ search: e.target.value })}
          placeholder="Line items, campaigns…"
          className="focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="link" className="h-auto px-2 text-muted-foreground" onClick={onReset}>
          Reset
        </Button>
      </div>
    </>
  )

  return (
    <div className="px-4 py-2 md:px-6">
      <div className="mb-2 flex justify-end lg:hidden">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm">
              Filters
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="h-[min(85vh,720px)]">
            <SheetHeader>
              <SheetTitle>Filters</SheetTitle>
            </SheetHeader>
            <div className="mt-4 grid grid-cols-1 gap-4">{sheetControls}</div>
          </SheetContent>
        </Sheet>
      </div>
      <div className="hidden items-end gap-2 lg:flex">
        <div className="min-w-[180px] max-w-[260px] flex-1">
          <MultiSelectCombobox
            options={clientOptions}
            values={filters.client_ids}
            onValuesChange={(values) => setFilters({ client_ids: values })}
            placeholder="Clients"
            allSelectedText={isScopedTenant ? "All my clients" : "All clients"}
            searchPlaceholder="Search clients…"
            buttonClassName="w-full"
            emptyMeansAll
          />
        </div>
        <div className="min-w-[140px] max-w-[200px] flex-1">
          <MultiSelectCombobox
            options={mediaOptions}
            values={filters.media_types}
            onValuesChange={(values) => setFilters({ media_types: values })}
            placeholder="Media"
            allSelectedText="All media"
            searchPlaceholder="Search…"
            buttonClassName="w-full"
            emptyMeansAll
          />
        </div>
        <div className="min-w-[140px] max-w-[200px] flex-1">
          <MultiSelectCombobox
            options={statusOptions}
            values={filters.statuses}
            onValuesChange={(values) => setFilters({ statuses: values })}
            placeholder="Status"
            allSelectedText="All statuses"
            searchPlaceholder="Search…"
            buttonClassName="w-full"
            emptyMeansAll
          />
        </div>
        <div className="min-w-[200px] max-w-[280px] flex-1">
          <DateRangePicker
            value={rangeValue}
            onChange={onRangeChange}
            displayFormat="dd MMM yyyy"
            className="w-full"
          />
        </div>
        <div className="min-w-[180px] max-w-[240px] flex-1">
          <Input
            id="pacing-toolbar-search"
            value={filters.search}
            onChange={(e) => setFilters({ search: e.target.value })}
            placeholder="Search line items…"
            className="h-9 focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ml-auto shrink-0 text-muted-foreground"
          onClick={onReset}
          title="Reset filters"
        >
          Reset
        </Button>
      </div>
    </div>
  )
}
