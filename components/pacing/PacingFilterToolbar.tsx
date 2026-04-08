"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { format, parseISO } from "date-fns"
import type { DateRange } from "react-day-picker"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { MultiSelectCombobox } from "@/components/ui/multi-select-combobox"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { useToast } from "@/components/ui/use-toast"
import { usePacingFilterStore, usePacingFilterStoreApi } from "@/lib/pacing/usePacingFilterStore"
import {
  PACING_MEDIA_TYPE_OPTIONS,
  PACING_STATUS_OPTIONS,
  cloneFiltersSnapshot,
  parseFiltersSnapshot,
  snapshotFromFilters,
} from "@/lib/pacing/pacingFilters"
import { createDefaultPacingFilters, type PacingFilterState } from "@/lib/pacing/usePacingFilterStore"
import {
  createPacingSavedView,
  fetchPacingSavedViews,
  setDefaultPacingSavedView,
} from "@/lib/xano/pacing-client"
import { SavedViewsDropdown } from "@/components/pacing/SavedViewsDropdown"

type ClientOption = { value: string; label: string }

function pacingFilterStateEqual(a: PacingFilterState, b: PacingFilterState): boolean {
  return (
    (a.savedViewId ?? null) === (b.savedViewId ?? null) &&
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
  if (f.savedViewId) p.set("view", f.savedViewId)
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
    savedViewId: null,
  }
}

function extractCreatedId(body: unknown): number | null {
  if (!body || typeof body !== "object") return null
  const o = body as Record<string, unknown>
  if (typeof o.id === "number" && Number.isFinite(o.id)) return o.id
  const inner = o.data
  if (inner && typeof inner === "object") {
    const id = (inner as Record<string, unknown>).id
    if (typeof id === "number" && Number.isFinite(id)) return id
  }
  return null
}

export function PacingFilterToolbar() {
  const { toast } = useToast()
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
  const [saveOpen, setSaveOpen] = useState(false)
  const [saveName, setSaveName] = useState("")
  const [saveDefault, setSaveDefault] = useState(false)
  const [saveBusy, setSaveBusy] = useState(false)
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

  const viewIdParam = searchParams.get("view") ?? ""

  useEffect(() => {
    if (!viewIdParam) return
    let cancelled = false
    void (async () => {
      try {
        const res = await fetchPacingSavedViews()
        if (cancelled) return
        const row = res.data.find((v) => String(v.id) === viewIdParam)
        if (row) {
          const snap = parseFiltersSnapshot(row.filters_json)
          if (snap) {
            const next: PacingFilterState = { ...snap, savedViewId: viewIdParam }
            const cur = store.getState().filters
            if (pacingFilterStateEqual(cur, next)) return
            store.getState().setFiltersState(next)
            return
          }
        }
        toast({
          variant: "destructive",
          title: "Saved view not found",
          description: "The link may be outdated.",
        })
        router.replace(pathname)
      } catch {
        if (!cancelled) router.replace(pathname)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [viewIdParam, pathname, router, store, toast])

  useEffect(() => {
    if (viewIdParam) return
    const next = stateFromSearchParams(new URLSearchParams(searchParams.toString()))
    const cur = store.getState().filters
    if (pacingFilterStateEqual(cur, next)) return
    setFiltersState(next)
  }, [viewIdParam, searchParams, setFiltersState, store])

  useEffect(() => {
    const viewInUrl = searchParams.get("view")
    if (viewInUrl && filters.savedViewId !== viewInUrl) return

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
        savedViewId: null,
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

  const onSaveView = useCallback(async () => {
    const name = saveName.trim()
    if (!name) return
    setSaveBusy(true)
    try {
      const snap = cloneFiltersSnapshot(filters)
      const body = snapshotFromFilters(snap)
      const raw = await createPacingSavedView({ name, filters_json: body, is_default: saveDefault })
      const id = extractCreatedId(raw)
      if (saveDefault && id !== null) {
        await setDefaultPacingSavedView(id)
      }
      toast({ title: "View saved", description: name })
      setSaveOpen(false)
      setSaveName("")
      setSaveDefault(false)
      if (id !== null) {
        setFilters({ savedViewId: String(id) })
      }
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Could not save view",
        description: e instanceof Error ? e.message : "Unknown error",
      })
    } finally {
      setSaveBusy(false)
    }
  }, [filters, saveDefault, saveName, setFilters, toast])

  const onReset = useCallback(() => {
    resetToDefaults()
    router.replace(pathname, { scroll: false })
  }, [pathname, resetToDefaults, router])

  const actionsRow = (
    <div className="flex flex-wrap items-center gap-2 lg:col-span-12">
      <SavedViewsDropdown />
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogTrigger asChild>
          <Button type="button" variant="secondary" size="sm">
            Save current view
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Save pacing view</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="pacing-save-name">Name</Label>
              <Input
                id="pacing-save-name"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="e.g. Q1 search clients"
              />
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox checked={saveDefault} onCheckedChange={(v) => setSaveDefault(Boolean(v))} />
              Set as my default view
            </label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setSaveOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={saveBusy || !saveName.trim()} onClick={() => void onSaveView()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Button type="button" variant="link" className="h-auto px-2 text-muted-foreground" onClick={onReset}>
        Reset
      </Button>
    </div>
  )

  const controls = (
    <>
      <div className="lg:col-span-3">
        <MultiSelectCombobox
          options={clientOptions}
          values={filters.client_ids}
          onValuesChange={(values) => setFilters({ client_ids: values, savedViewId: null })}
          placeholder="Clients"
          allSelectedText={isScopedTenant ? "All my clients" : "All clients"}
          searchPlaceholder="Search clients…"
          buttonClassName="w-full"
          emptyMeansAll
        />
      </div>
      <div className="lg:col-span-2">
        <MultiSelectCombobox
          options={mediaOptions}
          values={filters.media_types}
          onValuesChange={(values) => setFilters({ media_types: values, savedViewId: null })}
          placeholder="Media type"
          allSelectedText="All media types"
          searchPlaceholder="Search…"
          buttonClassName="w-full"
          emptyMeansAll
        />
      </div>
      <div className="lg:col-span-2">
        <MultiSelectCombobox
          options={statusOptions}
          values={filters.statuses}
          onValuesChange={(values) => setFilters({ statuses: values, savedViewId: null })}
          placeholder="Status"
          allSelectedText="All statuses"
          searchPlaceholder="Search…"
          buttonClassName="w-full"
          emptyMeansAll
        />
      </div>
      <div className="flex flex-col gap-1.5 lg:col-span-3">
        <Label className="text-xs font-medium text-muted-foreground">Date range</Label>
        <DateRangePicker
          value={rangeValue}
          onChange={onRangeChange}
          displayFormat="dd MMM yyyy"
          className="max-w-full"
        />
      </div>
      <div className="flex flex-col gap-1.5 lg:col-span-2">
        <Label htmlFor="pacing-toolbar-search" className="text-xs font-medium text-muted-foreground">
          Search
        </Label>
        <Input
          id="pacing-toolbar-search"
          value={filters.search}
          onChange={(e) => setFilters({ search: e.target.value, savedViewId: null })}
          placeholder="Line items, campaigns…"
          className="focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      {actionsRow}
    </>
  )

  return (
    <div className="px-4 py-3 md:px-6">
      <div className="mb-3 flex justify-end lg:hidden">
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
            <div className="mt-4 grid grid-cols-1 gap-4">{controls}</div>
          </SheetContent>
        </Sheet>
      </div>
      <div className="hidden grid-cols-1 gap-3 lg:grid lg:grid-cols-12">{controls}</div>
    </div>
  )
}
