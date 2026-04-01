"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { addMonths, format, startOfMonth } from "date-fns"
import { ArrowRight, Download } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { MultiSelectCombobox } from "@/components/ui/multi-select-combobox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { BillingView } from "@/components/finance/BillingView"
import { PublishersView, type PublisherGroup } from "@/components/finance/PublishersView"
import { toast } from "@/components/ui/use-toast"
import { useFinanceStore } from "@/lib/finance/useFinanceStore"
import type { BillingStatus, BillingType as StoreBillingType } from "@/lib/types/financeBilling"
import { exportBillingRecordsCsv, exportBillingRecordsExcel, exportPublishersExcel } from "@/lib/finance/export"

type BillingType = "all" | "media" | "sow" | "retainers"
type HubTab = "billing" | "publishers"
type StatusFilter = "all" | "draft" | "booked" | "approved" | "invoiced" | "paid"
type RangeMode = "single" | "range"

type SavedView = {
  name: string
  selectedClients: string[]
  rangeMode: RangeMode
  monthFrom: string
  monthTo: string
  billingType: BillingType
  statusFilter: StatusFilter
  activeTab: HubTab
}

type ClientOption = {
  value: string
  label: string
}

const SAVED_VIEWS_STORAGE_KEY = "finance-hub-saved-views-v1"

function monthOptions() {
  const current = startOfMonth(new Date())
  return Array.from({ length: 37 }, (_, i) => {
    const d = addMonths(current, i - 24)
    return { value: format(d, "yyyy-MM"), label: format(d, "MMMM yyyy") }
  })
}

function enumerateMonths(from: string, to: string): string[] {
  const [fy, fm] = from.split("-").map(Number)
  const [ty, tm] = to.split("-").map(Number)
  if (!fy || !fm || !ty || !tm) return [from]
  const start = new Date(fy, fm - 1, 1)
  const end = new Date(ty, tm - 1, 1)
  if (start > end) return [from]

  const out: string[] = []
  let ptr = start
  while (ptr <= end) {
    out.push(format(ptr, "yyyy-MM"))
    ptr = addMonths(ptr, 1)
  }
  return out
}

const ALL_BILLING_TYPES: StoreBillingType[] = ["media", "sow", "retainer"]
const ALL_STATUSES: BillingStatus[] = ["draft", "booked", "approved", "invoiced", "paid", "cancelled"]

export default function FinanceHubPageClient() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const setFilters = useFinanceStore((s) => s.setFilters)
  const setStoreActiveTab = useFinanceStore((s) => s.setActiveTab)
  const fetchBilling = useFinanceStore((s) => s.fetchBilling)
  const billingRecords = useFinanceStore((s) => s.billingRecords)
  const billingLoading = useFinanceStore((s) => s.billingLoading)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  const months = useMemo(() => monthOptions(), [])
  const currentMonth = useMemo(() => format(startOfMonth(new Date()), "yyyy-MM"), [])

  const [clientOptions, setClientOptions] = useState<ClientOption[]>([])
  const [selectedClients, setSelectedClients] = useState<string[]>([])
  const [rangeMode, setRangeMode] = useState<RangeMode>("single")
  const [monthFrom, setMonthFrom] = useState(currentMonth)
  const [monthTo, setMonthTo] = useState(currentMonth)
  const [billingType, setBillingType] = useState<BillingType>("all")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [activeTab, setActiveTab] = useState<HubTab>("billing")
  const [savedViews, setSavedViews] = useState<SavedView[]>([])
  const [selectedViewName, setSelectedViewName] = useState<string>("")
  const [publisherExportData, setPublisherExportData] = useState<{
    publishers: PublisherGroup[]
    monthLabel: string
  } | null>(null)
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)
  const [tabAnimation, setTabAnimation] = useState("opacity-100 translate-y-0")

  useEffect(() => {
    const tab = searchParams.get("tab")
    const mFrom = searchParams.get("from")
    const mTo = searchParams.get("to")
    const bType = searchParams.get("type")
    const status = searchParams.get("status")
    const clients = searchParams.get("clients")
    const q = searchParams.get("q")
    if (tab === "billing" || tab === "publishers") setActiveTab(tab)
    if (mFrom) setMonthFrom(mFrom)
    if (mTo) setMonthTo(mTo)
    if (bType === "all" || bType === "media" || bType === "sow" || bType === "retainers") setBillingType(bType)
    if (status === "all" || status === "draft" || status === "booked" || status === "approved" || status === "invoiced" || status === "paid") {
      setStatusFilter(status)
    }
    if (clients) setSelectedClients(clients.split(",").filter(Boolean))
    if (q) setSearchQuery(q)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const loadClients = async () => {
      try {
        const res = await fetch("/api/clients")
        if (!res.ok) return
        const data = await res.json()
        const options = (Array.isArray(data) ? data : [])
          .map((c: any) => ({
            value: String(c.id),
            label: c.mp_client_name || c.clientname_input || `Client ${c.id}`,
          }))
          .sort((a: ClientOption, b: ClientOption) => a.label.localeCompare(b.label))
        setClientOptions(options)
      } catch {
        setClientOptions([])
      }
    }
    loadClients()
  }, [])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SAVED_VIEWS_STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) return
      setSavedViews(parsed)
    } catch {
      setSavedViews([])
    }
  }, [])

  const persistSavedViews = useCallback((views: SavedView[]) => {
    setSavedViews(views)
    localStorage.setItem(SAVED_VIEWS_STORAGE_KEY, JSON.stringify(views))
  }, [])

  const saveCurrentView = useCallback(() => {
    const name = window.prompt("Name this saved view")
    if (!name || !name.trim()) return
    const next: SavedView = {
      name: name.trim(),
      selectedClients,
      rangeMode,
      monthFrom,
      monthTo,
      billingType,
      statusFilter,
      activeTab,
    }
    const deduped = savedViews.filter((v) => v.name !== next.name)
    const merged = [next, ...deduped]
    persistSavedViews(merged)
    setSelectedViewName(next.name)
  }, [
    activeTab,
    billingType,
    monthFrom,
    monthTo,
    persistSavedViews,
    rangeMode,
    savedViews,
    selectedClients,
    statusFilter,
  ])

  const loadSavedView = useCallback((name: string) => {
    setSelectedViewName(name)
    const view = savedViews.find((v) => v.name === name)
    if (!view) return
    setSelectedClients(view.selectedClients)
    setRangeMode(view.rangeMode)
    setMonthFrom(view.monthFrom)
    setMonthTo(view.monthTo)
    setBillingType(view.billingType)
    setStatusFilter(view.statusFilter)
    setActiveTab(view.activeTab)
  }, [savedViews])

  const handleExportPublishers = useCallback(async () => {
    if (!publisherExportData || publisherExportData.publishers.length === 0) {
      toast({ title: "No data", description: "There is no publisher data to export for current filters." })
      return
    }
    await exportPublishersExcel(
      publisherExportData.publishers,
      publisherExportData.monthLabel,
      "Finance_Publishers"
    )
  }, [publisherExportData])

  const exportCurrentExcel = useCallback(async () => {
    if (activeTab === "publishers") {
      await handleExportPublishers()
      return
    }
    await exportBillingRecordsExcel(billingRecords, "Finance_Billing_CurrentView.xlsx")
  }, [activeTab, billingRecords, handleExportPublishers])

  const exportCurrentCsv = useCallback(() => {
    exportBillingRecordsCsv(billingRecords, "Finance_Billing_CurrentView.csv")
  }, [billingRecords])

  const exportAllBillingExcel = useCallback(async () => {
    await exportBillingRecordsExcel(billingRecords, "Finance_Billing_All.xlsx")
  }, [billingRecords])

  useEffect(() => {
    const billingTypes: StoreBillingType[] =
      billingType === "all" ? ALL_BILLING_TYPES : [billingType === "retainers" ? "retainer" : billingType]
    const statuses: BillingStatus[] = statusFilter === "all" ? ALL_STATUSES : [statusFilter]
    setFilters({
      selectedClients,
      monthRange: { from: monthFrom, to: monthTo },
      billingTypes,
      statuses,
      searchQuery,
    })
    setStoreActiveTab(activeTab)

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      void fetchBilling()
    }, 300)

    const params = new URLSearchParams()
    params.set("tab", activeTab)
    params.set("from", monthFrom)
    params.set("to", monthTo)
    params.set("type", billingType)
    params.set("status", statusFilter)
    if (searchQuery.trim()) params.set("q", searchQuery.trim())
    else params.delete("q")
    if (selectedClients.length > 0) params.set("clients", selectedClients.join(","))
    else params.delete("clients")
    router.replace(`${pathname}?${params.toString()}`)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [
    activeTab,
    billingType,
    fetchBilling,
    monthFrom,
    monthTo,
    pathname,
    router,
    selectedClients,
    searchQuery,
    setFilters,
    setStoreActiveTab,
    statusFilter,
  ])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isMeta = event.metaKey || event.ctrlKey
      if (isMeta && event.key === "1") {
        event.preventDefault()
        setActiveTab("billing")
      }
      if (isMeta && event.key === "2") {
        event.preventDefault()
        setActiveTab("publishers")
      }
      if (isMeta && event.key.toLowerCase() === "f") {
        event.preventDefault()
        searchInputRef.current?.focus()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  useEffect(() => {
    setTabAnimation("opacity-0 translate-y-1")
    const t = setTimeout(() => setTabAnimation("opacity-100 translate-y-0"), 20)
    return () => clearTimeout(t)
  }, [activeTab])

  const filtersControls = (
    <>
      <div className="lg:col-span-3">
        <MultiSelectCombobox
          options={clientOptions}
          values={selectedClients}
          onValuesChange={setSelectedClients}
          placeholder="Filter clients"
          allSelectedText="All clients"
          searchPlaceholder="Search clients..."
          buttonClassName="w-full"
        />
      </div>
      <div className="lg:col-span-2">
        <Input
          ref={searchInputRef}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search..."
          className="focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      <div className="lg:col-span-3 flex gap-2">
        <Select value={rangeMode} onValueChange={(v: RangeMode) => setRangeMode(v)}>
          <SelectTrigger className="w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="single">Single</SelectItem>
            <SelectItem value="range">Range</SelectItem>
          </SelectContent>
        </Select>
        <Select value={monthFrom} onValueChange={setMonthFrom}>
          <SelectTrigger>
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
          <Select value={monthTo} onValueChange={setMonthTo}>
            <SelectTrigger>
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
        )}
      </div>
      <div className="lg:col-span-2">
        <Select value={billingType} onValueChange={(v: BillingType) => setBillingType(v)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All billing types</SelectItem>
            <SelectItem value="media">Media</SelectItem>
            <SelectItem value="sow">SOW</SelectItem>
            <SelectItem value="retainers">Retainers</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="lg:col-span-2">
        <Select value={statusFilter} onValueChange={(v: StatusFilter) => setStatusFilter(v)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="booked">Booked</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="invoiced">Invoiced</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </>
  )

  return (
    <div className="w-full max-w-none px-4 pb-10 pt-0 md:px-6">
      <div className="sticky top-0 z-20 -mx-4 border-b border-border/50 bg-background/95 px-4 pb-4 pt-4 backdrop-blur md:-mx-6 md:px-6">
        <div className="mb-3">
          <h1 className="text-2xl font-bold tracking-tight">Finance Hub</h1>
          <p className="text-sm text-muted-foreground">
            Unified billing and publisher views with shared filters and saved presets.
          </p>
        </div>

        <div className="mb-3 flex items-center justify-between gap-2 lg:hidden">
          <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
            <SheetTrigger asChild>
              <Button variant="outline">Filters</Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="h-[80vh]">
              <SheetHeader><SheetTitle>Filters</SheetTitle></SheetHeader>
              <div className="mt-4 grid grid-cols-1 gap-3">{filtersControls}</div>
            </SheetContent>
          </Sheet>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Download className="mr-2 h-4 w-4" />
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => void exportCurrentExcel()}>Export current view as Excel</DropdownMenuItem>
              <DropdownMenuItem onClick={() => void exportCurrentCsv()}>Export current view as CSV</DropdownMenuItem>
              <DropdownMenuItem onClick={() => void exportAllBillingExcel()}>Export all billing (Excel)</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="hidden grid-cols-1 gap-3 lg:grid lg:grid-cols-12">
          {filtersControls}
          <div className="lg:col-span-2 flex gap-2">
            <Select value={selectedViewName || "__none__"} onValueChange={loadSavedView}>
              <SelectTrigger>
                <SelectValue placeholder="Saved views" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__" disabled>
                  Saved views
                </SelectItem>
                {savedViews.map((view) => (
                  <SelectItem key={view.name} value={view.name}>
                    {view.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={saveCurrentView}>
              Save
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  <Download className="mr-2 h-4 w-4" />
                  Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => void exportCurrentExcel()}>Export current view as Excel</DropdownMenuItem>
                <DropdownMenuItem onClick={() => void exportCurrentCsv()}>Export current view as CSV</DropdownMenuItem>
                <DropdownMenuItem onClick={() => void exportAllBillingExcel()}>Export all billing (Excel)</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as HubTab)}>
          <TabsList className="max-w-full overflow-x-auto whitespace-nowrap">
            <TabsTrigger value="billing">Billing</TabsTrigger>
            <TabsTrigger value="publishers">Publishers</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link href="/finance/forecast">
              Forecasting
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>

      <div className="mt-4">
        {billingLoading && <div className="mb-2 h-0.5 w-full animate-pulse bg-primary/50" aria-live="polite" />}
        <div className="sr-only" aria-live="polite">
          {billingLoading ? "Loading finance data" : "Finance data loaded"}
        </div>
        {(statusFilter === "draft" || statusFilter === "invoiced" || statusFilter === "paid") && (
          <Badge variant="secondary" className="mb-3">
            Current APIs expose booked/approved and other buckets only, so this status filter may return no rows.
          </Badge>
        )}

        <div className={`transition-all duration-200 ease-out ${tabAnimation}`}>
          <div className={activeTab === "billing" ? "block" : "hidden"}>
            <BillingView />
          </div>
          <div className={activeTab === "publishers" ? "block" : "hidden"}>
            <PublishersView
              filters={{ selectedClients, rangeMode, monthFrom, monthTo, billingType, statusFilter }}
              onExportDataChange={setPublisherExportData}
            />
          </div>
        </div>
      </div>
    </div>
  )
}



