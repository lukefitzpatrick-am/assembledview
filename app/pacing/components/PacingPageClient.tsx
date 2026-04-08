"use client"

import { useEffect, useMemo, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import {
  Panel,
  PanelActions,
  PanelContent,
  PanelDescription,
  PanelHeader,
  PanelTitle,
} from "@/components/layout/Panel"
import { PanelRow, PanelRowCell } from "@/components/layout/PanelRow"
import { Button } from "@/components/ui/button"
import { Combobox } from "@/components/ui/combobox"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { createSavedPacingViewAction, deleteSavedPacingViewAction, updateSavedPacingViewAction } from "@/app/pacing/actions"
import type { SavedPacingView } from "@/lib/xano/savedViews"
import type { PacingRow as CombinedPacingRow } from "@/lib/snowflake/pacing-service"
import SocialPacingContainer from "@/components/dashboard/pacing/social/SocialPacingContainer"
import ProgrammaticPacingContainer from "@/components/dashboard/pacing/programmatic/ProgrammaticPacingContainer"
import { FolderOpen, ListFilter, RefreshCw, Save, Trash2, TrendingUp } from "lucide-react"

type DateWindowKey = "LAST_30" | "LAST_60" | "LAST_90" | "CAMPAIGN_DATES"

function SummaryCard({
  label,
  value,
  helper,
}: {
  label: string
  value: string
  helper: string
}) {
  return (
    <Panel className="overflow-hidden border-muted/70 bg-card shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <PanelContent standalone className="p-6">
        <div className="space-y-1">
          <div className="text-sm font-medium text-muted-foreground">{label}</div>
          <div className="text-3xl font-semibold leading-tight">{value}</div>
          <div className="text-xs text-muted-foreground">{helper}</div>
        </div>
      </PanelContent>
    </Panel>
  )
}

function EmptyState() {
  return (
    <Panel className="border-muted/70 bg-card shadow-sm">
      <PanelContent standalone className="flex flex-col items-center gap-3 p-10 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400">
          <FolderOpen className="h-6 w-6" />
        </div>
        <div className="space-y-1">
          <div className="text-base font-semibold">No pacing data yet</div>
          <div className="text-sm text-muted-foreground">
            Select a saved view and date window to load pacing.
          </div>
        </div>
      </PanelContent>
    </Panel>
  )
}

type ClientOption = { slug: string; name: string }

function slugifyClientName(value: unknown): string {
  const s = String(value ?? "").trim().toLowerCase()
  if (!s) return ""
  return s
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/(^-|-$)+/g, "")
}

type PaceStatus = "UNDER" | "ON" | "OVER"

type PortfolioData = {
  dataAsAt: string
  window: { startDate: string; endDate: string; key: string }
  totals: { plannedTotal: number; spentToDate: number; underCount: number; onCount: number; overCount: number }
  clients: Array<{
    clientSlug: string
    campaigns: Array<{
      mbaNumber: string
      campaignName: string
      spendToDate: number
      plannedSpendToDate: number
      paceStatus: PaceStatus | null
      lineItems: Array<{
        mbaNumber: string
        clientSlug: string
        campaignName: string
        channelGroup: "social" | "prog_display" | "prog_video"
        lineItemId: string
        platform: string
        buyType: string
        totalBudgetNumber: number
        deliverableTotalNumber?: number
        bursts: Array<{ startDate: string; endDate: string; budgetNumber: number; deliverableNumber?: number }>
        spendToDate: number
        plannedSpendToDate: number
        spendPaceStatus: PaceStatus | null
        deliverableMetric: "IMPRESSIONS" | "CLICKS" | "RESULTS" | "VIDEO_3S_VIEWS"
        deliverableToDate: number
        plannedDeliverableToDate: number
        deliverablePaceStatus: PaceStatus | null
      }>
    }>
  }>
  deliveryDaily: Array<{
    lineItemId: string
    date: string
    amountSpent: number
    impressions: number
    clicks: number
    results: number
    video3sViews: number
  }>
} | null

function formatCurrency(value: number | undefined) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value ?? 0)
}

function statusBadge(status: PaceStatus | null) {
  if (status === "UNDER")
    return {
      label: "Under",
      className: "bg-amber-500/15 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
    }
  if (status === "OVER")
    return {
      label: "Over",
      className: "bg-red-500/15 text-red-700 dark:bg-red-500/20 dark:text-red-300",
    }
  return {
    label: "On",
    className: "bg-emerald-500/15 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  }
}

export default function PacingPageClient({
  initialViews,
  initialSelectedViewId,
  initialWindowKey,
  portfolio,
}: {
  initialViews: SavedPacingView[]
  initialSelectedViewId: string | null
  initialWindowKey: string | null
  portfolio: PortfolioData
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [views, setViews] = useState<SavedPacingView[]>(initialViews ?? [])
  const [selectedViewId, setSelectedViewId] = useState<string | null>(initialSelectedViewId)
  const [dateWindow, setDateWindow] = useState<DateWindowKey>(
    (initialWindowKey as DateWindowKey) ?? "LAST_60"
  )
  const [clients, setClients] = useState<ClientOption[]>([])
  const [clientsLoading, setClientsLoading] = useState(false)

  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedView = useMemo(() => {
    if (!selectedViewId) return null
    const idNum = Number(selectedViewId)
    return views.find((v) => v.id === idNum) ?? null
  }, [selectedViewId, views])

  const effectiveClientSlugs = useMemo(() => {
    return selectedView?.client_slugs ?? []
  }, [selectedView?.client_slugs])

  const [pendingClientSlugs, setPendingClientSlugs] = useState<string[]>([])

  useEffect(() => {
    // When selection changes, sync pending clients + dateWindow from the view defaults.
    setPendingClientSlugs(effectiveClientSlugs)
    if (selectedView?.defaultDateWindow) {
      setDateWindow(selectedView.defaultDateWindow as DateWindowKey)
    }
  }, [effectiveClientSlugs, selectedView?.defaultDateWindow])

  function replaceQuery(next: URLSearchParams) {
    const qs = next.toString()
    const base = pathname ?? "/"
    router.replace(qs ? `${base}?${qs}` : base, { scroll: false })
  }

  function setQueryParam(key: string, value: string | null) {
    const next = new URLSearchParams(searchParams?.toString() ?? "")
    if (value && value.trim()) next.set(key, value.trim())
    else next.delete(key)
    replaceQuery(next)
  }

  // LocalStorage fallback for selected view
  useEffect(() => {
    if (selectedViewId) return
    try {
      const stored = localStorage.getItem("pacing.selectedViewId")
      if (stored && stored.trim()) {
        setSelectedViewId(stored.trim())
        setQueryParam("view", stored.trim())
      }
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!selectedViewId) return
    try {
      localStorage.setItem("pacing.selectedViewId", selectedViewId)
    } catch {
      // ignore
    }
  }, [selectedViewId])

  // Fetch clients list for multi-select UI
  useEffect(() => {
    let cancelled = false
    async function load() {
      setClientsLoading(true)
      try {
        const res = await fetch("/api/clients", { cache: "no-store" })
        const data = await res.json().catch(() => [])
        const rows = Array.isArray(data) ? data : []
        const parsed: ClientOption[] = rows
          .map((c: any) => {
            const name = String(c?.mp_client_name ?? c?.name ?? c?.client_name ?? "").trim()
            const slug = slugifyClientName(name)
            if (!name || !slug) return null
            return { name, slug }
          })
          .filter(Boolean) as ClientOption[]
        parsed.sort((a, b) => a.name.localeCompare(b.name))
        if (!cancelled) setClients(parsed)
      } catch {
        if (!cancelled) setClients([])
      } finally {
        if (!cancelled) setClientsLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const savedViewOptions = useMemo(
    () =>
      (views ?? []).map((v) => ({
        value: String(v.id),
        label: v.name || `View ${v.id}`,
        keywords: (v.client_slugs ?? []).join(" "),
      })),
    [views]
  )

  const clientLabelBySlug = useMemo(() => {
    const map = new Map<string, string>()
    clients.forEach((c) => map.set(c.slug, c.name))
    return map
  }, [clients])

  const selectedClientsLabel = useMemo(() => {
    if (!pendingClientSlugs.length) return "No clients"
    if (pendingClientSlugs.length === 1) return clientLabelBySlug.get(pendingClientSlugs[0]) ?? pendingClientSlugs[0]
    return `${pendingClientSlugs.length} clients`
  }, [clientLabelBySlug, pendingClientSlugs])

  const isLoading = isBusy || clientsLoading

  const [createOpen, setCreateOpen] = useState(false)
  const [newViewName, setNewViewName] = useState("")
  const [newViewClients, setNewViewClients] = useState<string[]>([])
  const [newViewDefaultWindow, setNewViewDefaultWindow] = useState<DateWindowKey>("LAST_60")

  async function handleCreateView() {
    setError(null)
    const name = newViewName.trim()
    if (!name) {
      setError("View name is required.")
      return
    }
    if (!newViewClients.length) {
      setError("Select at least one client.")
      return
    }

    setIsBusy(true)
    try {
      const result = await createSavedPacingViewAction({
        name,
        client_slugs: Array.from(new Set(newViewClients)).sort(),
        defaultDateWindow: newViewDefaultWindow,
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      const nextViews = [...views, result.view].sort((a, b) => a.name.localeCompare(b.name))
      setViews(nextViews)
      setSelectedViewId(String(result.view.id))
      setQueryParam("view", String(result.view.id))
      router.refresh()
      setCreateOpen(false)
      setNewViewName("")
      setNewViewClients([])
    } finally {
      setIsBusy(false)
    }
  }

  async function handleUpdateView() {
    if (!selectedView) return
    setError(null)
    setIsBusy(true)
    try {
      const result = await updateSavedPacingViewAction(selectedView.id, {
        client_slugs: Array.from(new Set(pendingClientSlugs)).sort(),
        defaultDateWindow: dateWindow,
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setViews((prev) => prev.map((v) => (v.id === result.view.id ? result.view : v)))
      router.refresh()
    } finally {
      setIsBusy(false)
    }
  }

  async function handleDeleteView() {
    if (!selectedView) return
    const ok = window.confirm(`Delete saved view "${selectedView.name}"?`)
    if (!ok) return
    setError(null)
    setIsBusy(true)
    try {
      const result = await deleteSavedPacingViewAction(selectedView.id)
      if (!result.ok) {
        setError(result.error)
        return
      }
      const remaining = views.filter((v) => v.id !== selectedView.id)
      setViews(remaining)
      setSelectedViewId(null)
      setQueryParam("view", null)
      router.refresh()
    } finally {
      setIsBusy(false)
    }
  }

  const summary = portfolio?.totals ?? null

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selectedLineItemId, setSelectedLineItemId] = useState<string | null>(null)
  const selectedLineItem = useMemo(() => {
    if (!selectedLineItemId || !portfolio) return null
    for (const client of portfolio.clients) {
      for (const campaign of client.campaigns) {
        const match = campaign.lineItems.find((li) => li.lineItemId === selectedLineItemId)
        if (match) return match
      }
    }
    return null
  }, [portfolio, selectedLineItemId])

  const initialPacingRowsForDrawer = useMemo((): CombinedPacingRow[] => {
    if (!selectedLineItem || !portfolio) return []
    const targetId = selectedLineItem.lineItemId
    const platform = String(selectedLineItem.platform ?? "").toLowerCase()
    const channel = (() => {
      if (selectedLineItem.channelGroup === "prog_display") return "programmatic-display"
      if (selectedLineItem.channelGroup === "prog_video") return "programmatic-video"
      // social
      if (platform.includes("tiktok")) return "tiktok"
      return "meta"
    })()

    return portfolio.deliveryDaily
      .filter((r) => r.lineItemId === targetId)
      .map((r) => ({
        channel: channel as any,
        dateDay: r.date,
        adsetName: null,
        entityName: null,
        campaignId: null,
        campaignName: null,
        adsetId: null,
        entityId: null,
        lineItemId: targetId,
        amountSpent: r.amountSpent,
        impressions: r.impressions,
        clicks: r.clicks,
        results: r.results,
        video3sViews: r.video3sViews,
        maxFivetranSyncedAt: null,
        updatedAt: null,
      }))
  }, [portfolio, selectedLineItem])

  const drawerLineItemProps = useMemo(() => {
    if (!selectedLineItem) return null
    const bounds = (() => {
      const starts = selectedLineItem.bursts.map((b) => b.startDate).filter(Boolean).sort()
      const ends = selectedLineItem.bursts.map((b) => b.endDate).filter(Boolean).sort()
      return {
        start: starts.length ? starts[0] : undefined,
        end: ends.length ? ends.slice(-1)[0] : undefined,
      }
    })()

    const bursts_json = selectedLineItem.bursts.map((b) => ({
      start_date: b.startDate,
      end_date: b.endDate,
      media_investment: b.budgetNumber,
      deliverables: b.deliverableNumber ?? 0,
      budget_number: b.budgetNumber,
      calculated_value_number: b.deliverableNumber ?? 0,
    }))

    return {
      campaignStart: bounds.start,
      campaignEnd: bounds.end,
      socialLineItem: {
        line_item_id: selectedLineItem.lineItemId,
        line_item_name: selectedLineItem.platform || selectedLineItem.lineItemId,
        buy_type: selectedLineItem.buyType,
        platform: selectedLineItem.platform,
        bursts_json,
        total_budget: selectedLineItem.totalBudgetNumber,
        goal_deliverable_total: selectedLineItem.deliverableTotalNumber,
      },
      programmaticLineItem: {
        line_item_id: selectedLineItem.lineItemId,
        line_item_name: selectedLineItem.platform || selectedLineItem.lineItemId,
        buy_type: selectedLineItem.buyType,
        platform: selectedLineItem.platform,
        bursts_json,
        total_budget: selectedLineItem.totalBudgetNumber,
        goal_deliverable_total: selectedLineItem.deliverableTotalNumber,
      },
    }
  }, [selectedLineItem])

  return (
    <div className="space-y-6">
      <Panel className="overflow-hidden border-muted/70 bg-card shadow-sm">
        <PanelHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="mt-1 flex h-10 w-10 items-center justify-center rounded-full border border-border/50 bg-muted/60 text-muted-foreground">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <PanelTitle className="text-3xl font-semibold leading-tight">Pacing</PanelTitle>
              <PanelDescription className="text-base">
                Portfolio pacing across saved client selections.
              </PanelDescription>
            </div>
          </div>

          <PanelActions className="flex flex-wrap items-center gap-2 pt-0">
            <Button variant="outline" size="sm" asChild>
              <Link href="/pacing/settings">Settings</Link>
            </Button>
            <Badge variant="outline" className="w-fit rounded-full px-3 py-1 text-[11px]">
              Admin
            </Badge>
          </PanelActions>
        </PanelHeader>

        <PanelContent className="space-y-6">
          <PanelRow
            title="View controls"
            helperText="Pick a saved view, adjust the client set, and choose how the reporting window is calculated."
          >
            <PanelRowCell span="third">
              <div className="space-y-1.5">
                <div className="text-xs font-medium text-muted-foreground">Saved view</div>
                <Combobox
                  options={savedViewOptions}
                  value={selectedViewId ?? ""}
                  onValueChange={(next) => {
                    const nextId = next?.trim() || null
                    setSelectedViewId(nextId)
                    setQueryParam("view", nextId)
                    router.refresh()
                  }}
                  placeholder="Select a saved view"
                  searchPlaceholder="Search saved views..."
                  emptyText="No saved views"
                />
              </div>
            </PanelRowCell>

            <PanelRowCell span="third">
              <div className="space-y-1.5">
                <div className="text-xs font-medium text-muted-foreground">Clients</div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-between"
                      disabled={!selectedView || clientsLoading}
                    >
                      <span className="truncate">{selectedClientsLabel}</span>
                      <span className="text-xs text-muted-foreground">
                        {clientsLoading ? "Loading..." : ""}
                      </span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-[320px]">
                    <DropdownMenuLabel>Select clients</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {clients.length ? (
                      clients.map((c) => {
                        const checked = pendingClientSlugs.includes(c.slug)
                        return (
                          <DropdownMenuCheckboxItem
                            key={c.slug}
                            checked={checked}
                            onCheckedChange={(nextChecked) => {
                              setPendingClientSlugs((prev) => {
                                const set = new Set(prev)
                                if (nextChecked) set.add(c.slug)
                                else set.delete(c.slug)
                                return Array.from(set).sort()
                              })
                            }}
                          >
                            {c.name}
                          </DropdownMenuCheckboxItem>
                        )
                      })
                    ) : (
                      <div className="px-2 py-1.5 text-sm text-muted-foreground">
                        No clients found.
                      </div>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
                <div className="text-[11px] text-muted-foreground">
                  Client selection is saved to the current view.
                </div>
              </div>
            </PanelRowCell>

            <PanelRowCell span="third">
              <div className="space-y-1.5">
                <div className="text-xs font-medium text-muted-foreground">Date window</div>
                <Tabs
                  value={dateWindow}
                  onValueChange={(v) => {
                    const next = v as DateWindowKey
                    setDateWindow(next)
                    setQueryParam("window", next)
                    router.refresh()
                  }}
                >
                  <TabsList className="w-full justify-between">
                    <TabsTrigger value="LAST_30" className="text-xs">Last 30</TabsTrigger>
                    <TabsTrigger value="LAST_60" className="text-xs">Last 60</TabsTrigger>
                    <TabsTrigger value="LAST_90" className="text-xs">Last 90</TabsTrigger>
                    <TabsTrigger value="CAMPAIGN_DATES" className="text-xs">Campaign</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </PanelRowCell>
          </PanelRow>

          <PanelRow
            title="Saved views"
            helperText="Create views for reusable client groupings. Update persists client picks and default window to the selected view."
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm">
                      New view
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Create saved view</DialogTitle>
                      <DialogDescription>
                        Save a set of clients and a default date window.
                      </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <div className="text-sm font-medium">Name</div>
                        <Input
                          value={newViewName}
                          onChange={(e) => setNewViewName(e.target.value)}
                          placeholder="e.g. Top 10 clients"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <div className="text-sm font-medium">Clients</div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" className="w-full justify-between" disabled={clientsLoading}>
                              <span className="truncate">
                                {newViewClients.length
                                  ? `${newViewClients.length} selected`
                                  : clientsLoading
                                    ? "Loading clients..."
                                    : "Select clients"}
                              </span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent className="w-[320px]">
                            <DropdownMenuLabel>Select clients</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {clients.length ? (
                              clients.map((c) => {
                                const checked = newViewClients.includes(c.slug)
                                return (
                                  <DropdownMenuCheckboxItem
                                    key={c.slug}
                                    checked={checked}
                                    onCheckedChange={(nextChecked) => {
                                      setNewViewClients((prev) => {
                                        const set = new Set(prev)
                                        if (nextChecked) set.add(c.slug)
                                        else set.delete(c.slug)
                                        return Array.from(set).sort()
                                      })
                                    }}
                                  >
                                    {c.name}
                                  </DropdownMenuCheckboxItem>
                                )
                              })
                            ) : (
                              <div className="px-2 py-1.5 text-sm text-muted-foreground">
                                No clients found.
                              </div>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>

                      <div className="space-y-1.5">
                        <div className="text-sm font-medium">Default date window</div>
                        <Tabs
                          value={newViewDefaultWindow}
                          onValueChange={(v) => setNewViewDefaultWindow(v as DateWindowKey)}
                        >
                          <TabsList className="w-full justify-between">
                            <TabsTrigger value="LAST_30" className="text-xs">Last 30</TabsTrigger>
                            <TabsTrigger value="LAST_60" className="text-xs">Last 60</TabsTrigger>
                            <TabsTrigger value="LAST_90" className="text-xs">Last 90</TabsTrigger>
                            <TabsTrigger value="CAMPAIGN_DATES" className="text-xs">Campaign</TabsTrigger>
                          </TabsList>
                        </Tabs>
                      </div>

                      {error ? (
                        <div
                          role="alert"
                          className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
                        >
                          {error}
                        </div>
                      ) : null}
                    </div>

                    <DialogFooter>
                      <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={isBusy}>
                        Cancel
                      </Button>
                      <Button onClick={handleCreateView} disabled={isBusy}>
                        <Save className="mr-2 h-4 w-4" />
                        Create
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleUpdateView}
                  disabled={!selectedView || isBusy}
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Update view
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDeleteView}
                  disabled={!selectedView || isBusy}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </Button>
              </div>
            }
          >
            <PanelRowCell span="full">
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-muted/10 px-3 py-2.5 text-sm">
                <ListFilter className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="font-medium text-foreground">Active view</span>
                <span className="text-muted-foreground">
                  {selectedView ? selectedView.name : "Select a saved view to begin"}
                </span>
              </div>
            </PanelRowCell>
          </PanelRow>

          {error && !createOpen ? (
            <div
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </div>
          ) : null}
        </PanelContent>
      </Panel>

      <PanelRow
        title="Portfolio summary"
        helperText="Roll-up totals for the current window and pace distribution across campaigns."
      >
        {isLoading ? (
          <>
            <PanelRowCell span="quarter">
              <Skeleton className="h-28 w-full rounded-lg" />
            </PanelRowCell>
            <PanelRowCell span="quarter">
              <Skeleton className="h-28 w-full rounded-lg" />
            </PanelRowCell>
            <PanelRowCell span="quarter">
              <Skeleton className="h-28 w-full rounded-lg" />
            </PanelRowCell>
            <PanelRowCell span="quarter">
              <Skeleton className="h-28 w-full rounded-lg" />
            </PanelRowCell>
          </>
        ) : (
          <>
            <PanelRowCell span="quarter">
              <SummaryCard
                label="Spend"
                value={summary ? formatCurrency(summary.spentToDate) : "—"}
                helper={portfolio ? `As at ${portfolio.dataAsAt}` : "Delivered in selected window"}
              />
            </PanelRowCell>
            <PanelRowCell span="quarter">
              <SummaryCard
                label="Planned"
                value={summary ? formatCurrency(summary.plannedTotal) : "—"}
                helper={portfolio ? `Window ${portfolio.window.startDate} → ${portfolio.window.endDate}` : "Planned total (all line items)"}
              />
            </PanelRowCell>
            <PanelRowCell span="quarter">
              <SummaryCard
                label="Campaigns under / on / over"
                value={summary ? `${summary.underCount} / ${summary.onCount} / ${summary.overCount}` : "—"}
                helper="Spend pace status (90–110% = On)"
              />
            </PanelRowCell>
            <PanelRowCell span="quarter">
              <SummaryCard
                label="Selected view"
                value={selectedView ? selectedView.name : "—"}
                helper={selectedView ? `${selectedView.client_slugs.length} clients` : "Pick a view to load pacing"}
              />
            </PanelRowCell>
          </>
        )}
      </PanelRow>

      <Panel className="border-muted/70 bg-card shadow-sm">
        <PanelHeader className="border-b border-border/50 pb-4">
          <div className="flex flex-1 flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <PanelTitle className="text-base">Clients & line items</PanelTitle>
              <PanelDescription>
                Grouped by client and campaign. Open a line item for pacing drill-down.
              </PanelDescription>
            </div>
            <Badge variant="secondary" className="w-fit rounded-full px-3 py-1 text-[11px]">
              {portfolio
                ? `${portfolio.clients.reduce((sum, c) => sum + c.campaigns.length, 0)} campaigns`
                : "0 campaigns"}
            </Badge>
          </div>
        </PanelHeader>
        <PanelContent>
          {!selectedView ? (
            <EmptyState />
          ) : !portfolio ? (
            <div className="rounded-lg border border-border/60 bg-muted/10 p-4 text-sm text-muted-foreground">
              No portfolio data loaded yet. If you just created a view, click “Apply window”, or try refreshing.
            </div>
          ) : (
            <div className="space-y-4">
              {portfolio.clients.length === 0 ? (
                <EmptyState />
              ) : (
                <Accordion type="multiple" defaultValue={[]}>
                  {portfolio.clients.map((client) => (
                    <AccordionItem key={client.clientSlug} value={client.clientSlug}>
                      <AccordionTrigger className="rounded-xl px-3 py-2 text-left text-sm font-semibold">
                        <div className="flex w-full items-center justify-between gap-2">
                          <div className="flex flex-col text-left">
                            <span className="capitalize">{client.clientSlug.replace(/-/g, " ")}</span>
                            <span className="text-xs font-normal text-muted-foreground">
                              {client.campaigns.length} campaigns
                            </span>
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="space-y-3">
                        {client.campaigns.map((campaign) => {
                          const badge = statusBadge(campaign.paceStatus)
                          return (
                            <div
                              key={`${campaign.mbaNumber}:${campaign.campaignName}`}
                              className="rounded-lg border border-border/60 bg-muted/5 p-3 shadow-sm"
                            >
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div className="space-y-0.5">
                                  <div className="text-sm font-semibold">{campaign.campaignName || "—"}</div>
                                  <div className="text-xs text-muted-foreground">
                                    MBA{" "}
                                    <Link
                                      href={`/mediaplans/mba/${encodeURIComponent(campaign.mbaNumber)}/edit`}
                                      className="underline underline-offset-2"
                                    >
                                      {campaign.mbaNumber}
                                    </Link>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Badge className={`rounded-full px-3 py-1 text-[11px] ${badge.className}`}>
                                    {badge.label}
                                  </Badge>
                                  <Badge variant="secondary" className="rounded-full px-3 py-1 text-[11px]">
                                    {formatCurrency(campaign.spendToDate)} / {formatCurrency(campaign.plannedSpendToDate)}
                                  </Badge>
                                </div>
                              </div>

                              <div className="mt-3 space-y-2">
                                {campaign.lineItems.map((li) => {
                                  const liBadge = statusBadge(li.spendPaceStatus)
                                  return (
                                    <button
                                      key={li.lineItemId}
                                      type="button"
                                      className="w-full rounded-lg border border-border/60 bg-muted/10 px-3 py-2 text-left transition hover:bg-muted/20"
                                      onClick={() => {
                                        setSelectedLineItemId(li.lineItemId)
                                        setDrawerOpen(true)
                                      }}
                                    >
                                      <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div className="min-w-0">
                                          <div className="truncate text-sm font-medium">
                                            {li.platform || li.lineItemId}
                                          </div>
                                          <div className="text-xs text-muted-foreground">
                                            {li.channelGroup} • {li.buyType} • {li.lineItemId}
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <Badge className={`rounded-full px-3 py-1 text-[11px] ${liBadge.className}`}>
                                            {liBadge.label}
                                          </Badge>
                                          <Badge variant="secondary" className="rounded-full px-3 py-1 text-[11px]">
                                            {formatCurrency(li.spendToDate)} / {formatCurrency(li.plannedSpendToDate)}
                                          </Badge>
                                        </div>
                                      </div>
                                    </button>
                                  )
                                })}
                              </div>
                            </div>
                          )
                        })}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              )}
            </div>
          )}
        </PanelContent>
      </Panel>

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="right" className="w-full sm:max-w-3xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Pacing drill-down</SheetTitle>
          </SheetHeader>

          {!selectedLineItem || !drawerLineItemProps ? (
            <div className="mt-6 text-sm text-muted-foreground">Select a line item to view details.</div>
          ) : (
            <div className="mt-4 space-y-5">
              <Panel className="border-border/60 bg-muted/10 shadow-none">
                <PanelContent standalone className="p-3 text-sm">
                  <div className="font-semibold">{selectedLineItem.platform || selectedLineItem.lineItemId}</div>
                  <div className="text-xs text-muted-foreground">
                    {selectedLineItem.channelGroup} • {selectedLineItem.buyType} • {selectedLineItem.lineItemId}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge variant="secondary" className="rounded-full px-3 py-1 text-[11px]">
                      As at {portfolio?.dataAsAt ?? "—"}
                    </Badge>
                    <Badge variant="secondary" className="rounded-full px-3 py-1 text-[11px]">
                      Spend {formatCurrency(selectedLineItem.spendToDate)} / {formatCurrency(selectedLineItem.plannedSpendToDate)}
                    </Badge>
                  </div>
                </PanelContent>
              </Panel>

              {selectedLineItem.channelGroup === "social" ? (
                <SocialPacingContainer
                  clientSlug={selectedLineItem.clientSlug}
                  mbaNumber={selectedLineItem.mbaNumber}
                  socialLineItems={[drawerLineItemProps.socialLineItem as any]}
                  campaignStart={drawerLineItemProps.campaignStart}
                  campaignEnd={drawerLineItemProps.campaignEnd}
                  initialPacingRows={initialPacingRowsForDrawer}
                  pacingLineItemIds={[selectedLineItem.lineItemId]}
                />
              ) : (
                <ProgrammaticPacingContainer
                  clientSlug={selectedLineItem.clientSlug}
                  mbaNumber={selectedLineItem.mbaNumber}
                  progDisplayLineItems={
                    selectedLineItem.channelGroup === "prog_display"
                      ? ([drawerLineItemProps.programmaticLineItem as any] as any)
                      : []
                  }
                  progVideoLineItems={
                    selectedLineItem.channelGroup === "prog_video"
                      ? ([drawerLineItemProps.programmaticLineItem as any] as any)
                      : []
                  }
                  campaignStart={drawerLineItemProps.campaignStart}
                  campaignEnd={drawerLineItemProps.campaignEnd}
                  initialPacingRows={initialPacingRowsForDrawer}
                  pacingLineItemIds={[selectedLineItem.lineItemId]}
                />
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}

