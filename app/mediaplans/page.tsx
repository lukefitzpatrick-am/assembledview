"use client"

import { useState, useEffect, useMemo, useCallback, Suspense } from "react"
import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import { ViewStateBoundary } from "@/components/ui/ViewStateBoundary"
import { resolveListViewState } from "@/lib/ui/viewState"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { format } from "date-fns"
import { PlusCircle } from "lucide-react"
import { MediaChannelTag, mediaChannelTagRowClassName } from "@/components/dashboard/MediaChannelTag"
import { campaignMediaTypeTagLabels } from "@/lib/dashboard/campaignMediaTypeTags"
import { cn } from "@/lib/utils"
import { compareValues, SortableTableHeader, SortDirection } from "@/components/ui/sortable-table-header"
import { PanelRow, PanelRowCell } from "@/components/layout/PanelRow"
import { MediaPlanEditorHero } from "@/components/mediaplans/MediaPlanEditorHero"
import { Panel, PanelActions, PanelContent, PanelHeader, PanelTitle } from "@/components/layout/Panel"
import { useListGridLayoutPreference } from "@/lib/hooks/useListGridLayoutPreference"
import { ListGridToggle } from "@/components/ui/list-grid-toggle"
import { DashboardCampaignPlanCard, dashboardCampaignGridClassName } from "@/components/dashboard/DashboardEntityCards"
import { CampaignRowActions, hasPublishedVersionFromPointer } from "@/components/campaign/CampaignRowActions"
import { DashboardFilterBar } from "@/components/dashboard/DashboardFilterBar"
import { formatAUD } from "@/lib/format/money"
import { safeFormatDate } from "@/lib/dashboard/safeFormatDate"
import {
  CAMPAIGN_LIST_STATUSES,
  isScheduleEnded,
  normalizeStoredCampaignStatus,
} from "@/lib/mediaplans/campaignListStatus"
import { matchesMediaPlanSearch } from "@/lib/mediaplans/matchesMediaPlanSearch"
import { AuFinancialYearFilterPills } from "@/components/dashboard/AuFinancialYearFilterPills"
import {
  campaignOverlapsAuFinancialYear,
  parseAuFySearchParam,
  serializeAuFySearchParam,
  type AuFyFilterValue,
} from "@/lib/dates/auFinancialYear"
import { useAuthContext } from "@/contexts/AuthContext"
import {
  defaultDashboardViewFilters,
  normalizeClientFilterValue,
  type DashboardViewFilters,
} from "@/lib/dashboard/homeDashboardFilters"
import {
  findPinnedClientsView,
  legacyPinnedClientsKeyForUser,
  parseSavedViewsFromStorageJson,
  readClientsFromLegacyPinKey,
  savedViewsListKeyForUser,
  serializeSavedViewsToStorageJson,
  upsertPinnedClientsView,
  type SavedDashboardViewRecord,
} from "@/lib/dashboard/savedDashboardViews"
import type { MultiSelectOption } from "@/components/ui/multi-select-combobox"

const slugifyClientName = (name?: string | null) => {
  if (!name || typeof name !== "string") return ""
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .trim()
}

// Define the MediaPlan interface to handle both MediaPlanMaster and MediaPlanVersions
interface MediaPlan {
  id: number;
  // Use standardized field name
  mp_client_name: string;
  mba_number: string;
  mp_campaignname?: string;
  campaign_name?: string;
  version_number: number;
  campaign_status: string;
  campaign_start_date: string;
  campaign_end_date: string;
  mp_campaignbudget: number;
  /** From master overlay on GET /api/mediaplans; omit when the payload lacks it. */
  published_version_id?: number | null;
  created_at: number;
  // Media type flags (these will come from the latest version)
  mp_television?: boolean;
  mp_radio?: boolean;
  mp_newspaper?: boolean;
  mp_magazines?: boolean;
  mp_ooh?: boolean;
  mp_cinema?: boolean;
  mp_digidisplay?: boolean;
  mp_digiaudio?: boolean;
  mp_digivideo?: boolean;
  mp_bvod?: boolean;
  mp_integration?: boolean;
  mp_search?: boolean;
  mp_socialmedia?: boolean;
  mp_progdisplay?: boolean;
  mp_progvideo?: boolean;
  mp_progbvod?: boolean;
  mp_progaudio?: boolean;
  mp_progooh?: boolean;
  mp_influencers?: boolean;
  // Additional fields that might be present
  brand?: string;
  client_contact?: string;
  po_number?: string;
  fixed_fee?: boolean;
  /** Date-derived hint only — never replaces campaign_status. */
  scheduleEnded?: boolean;
}

type SortableValue = string | number | Date | boolean | null | undefined

type SortState = {
  column: string
  direction: SortDirection
}

const CAMPAIGN_STATUSES = [...CAMPAIGN_LIST_STATUSES]

function MediaPlansPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const { user, isLoading: authLoading } = useAuthContext()
  const { mode: listGridMode, setMode: setListGridMode } = useListGridLayoutPreference()
  const [mediaPlans, setMediaPlans] = useState<MediaPlan[]>([])
  const [filteredPlans, setFilteredPlans] = useState<MediaPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [listMayBeStale, setListMayBeStale] = useState(false)
  const [listFetchedAt, setListFetchedAt] = useState<number | null>(null)
  const [searchTerm, setSearchTerm] = useState(() => searchParams.get("q") ?? "")
  const [selectedClients, setSelectedClients] = useState<string[]>([])
  const [fyFilter, setFyFilter] = useState<AuFyFilterValue>(() =>
    parseAuFySearchParam(searchParams.get("fy")),
  )
  const [sortStates, setSortStates] = useState<Record<string, SortState>>({})
  const [urlHydrated, setUrlHydrated] = useState(false)
  const [pinsHydrated, setPinsHydrated] = useState(false)
  const [savedViews, setSavedViews] = useState<SavedDashboardViewRecord[]>([])
  const [savedViewJustSaved, setSavedViewJustSaved] = useState(false)

  const dashboardStorageUserId = useMemo(() => {
    if (!user) return null
    const anyUser = user as { sub?: string; email?: string; name?: string }
    const id = (anyUser?.sub || anyUser?.email || anyUser?.name || "").toString().trim()
    return id || null
  }, [user])

  const savedViewsListKey = savedViewsListKeyForUser(dashboardStorageUserId)
  const legacyPinnedClientsKey = legacyPinnedClientsKeyForUser(dashboardStorageUserId)

  const dashboardFilters: DashboardViewFilters = useMemo(
    () => ({
      ...defaultDashboardViewFilters(),
      campaignSearch: searchTerm,
      clients: selectedClients,
    }),
    [searchTerm, selectedClients],
  )

  const clientFilterOptions: MultiSelectOption[] = useMemo(() => {
    const seen = new Set<string>()
    const options: MultiSelectOption[] = []
    for (const plan of mediaPlans) {
      const label = String(plan.mp_client_name ?? "").trim()
      if (!label) continue
      const value = normalizeClientFilterValue(label)
      if (!value || seen.has(value)) continue
      seen.add(value)
      options.push({ value, label })
    }
    return options.sort((a, b) => a.label.localeCompare(b.label))
  }, [mediaPlans])

  const getNextDirection = (current: SortDirection) =>
    current === "asc" ? "desc" : current === "desc" ? null : "asc"

  const toggleSortForStatus = (status: string, column: string) => {
    setSortStates(prev => {
      const prevState = prev[status] || { column: "", direction: null }
      const direction = prevState.column === column ? getNextDirection(prevState.direction) : "asc"
      return { ...prev, [status]: { column, direction } }
    })
  }

  const safeDate = (value: string) => {
    const d = new Date(value)
    return isNaN(d.getTime()) ? new Date(0) : d
  }

  const getSortDirection = (status: string, column: string): SortDirection =>
    sortStates[status]?.column === column ? sortStates[status]?.direction ?? null : null

  const planSelectors: Record<string, (plan: MediaPlan) => SortableValue> = {
    id: plan => plan.id,
    client: plan => plan.mp_client_name || "",
    mba: plan => plan.mba_number || "",
    campaign: plan => plan.mp_campaignname || plan.campaign_name || "",
    version: plan => plan.version_number,
    budget: plan => plan.mp_campaignbudget || 0,
    startDate: plan => safeDate(plan.campaign_start_date),
    endDate: plan => safeDate(plan.campaign_end_date),
    status: plan => plan.campaign_status || "",
  }

  const applySortForStatus = (plans: MediaPlan[], status: string) => {
    const sortState = sortStates[status]
    if (!sortState?.direction || !planSelectors[sortState.column]) return plans
    const select = planSelectors[sortState.column]
    return [...plans].sort((a, b) =>
      compareValues(select(a), select(b), sortState.direction as Exclude<SortDirection, null>)
    )
  }

  // Fetch media plans from the API
  useEffect(() => {
    const fetchMediaPlans = async () => {
      try {
        setLoading(true);
        const response = await fetch("/api/mediaplans");
        if (!response.ok) {
          throw new Error("Failed to fetch media plans");
        }
        const warning = response.headers.get("x-warning")
        const fetchedAtRaw = response.headers.get("x-cache-fetched-at")
        const fetchedAtMs = fetchedAtRaw ? Number(fetchedAtRaw) : NaN
        setListMayBeStale(warning === "served-stale-after-upstream-failure")
        setListFetchedAt(Number.isFinite(fetchedAtMs) ? fetchedAtMs : null)
        const data = await response.json();
        console.log("Fetched media plans data:", data);
  
        // Handle both MediaPlanMaster and MediaPlanVersions data structures
        const mediaPlansData = Array.isArray(data) ? data : [data];
        console.log("Processed media plans data:", mediaPlansData);
        
        // Debug: Log media type flags for first plan
        if (mediaPlansData.length > 0) {
          console.log("First plan media type flags:", {
            mp_television: mediaPlansData[0].mp_television,
            mp_radio: mediaPlansData[0].mp_radio,
            mp_newspaper: mediaPlansData[0].mp_newspaper,
            mp_magazines: mediaPlansData[0].mp_magazines,
            mp_ooh: mediaPlansData[0].mp_ooh,
            mp_cinema: mediaPlansData[0].mp_cinema,
            mp_digidisplay: mediaPlansData[0].mp_digidisplay,
            mp_digiaudio: mediaPlansData[0].mp_digiaudio,
            mp_digivideo: mediaPlansData[0].mp_digivideo,
            mp_bvod: mediaPlansData[0].mp_bvod,
            mp_integration: mediaPlansData[0].mp_integration,
            mp_search: mediaPlansData[0].mp_search,
            mp_socialmedia: mediaPlansData[0].mp_socialmedia,
            mp_progdisplay: mediaPlansData[0].mp_progdisplay,
            mp_progvideo: mediaPlansData[0].mp_progvideo,
            mp_progbvod: mediaPlansData[0].mp_progbvod,
            mp_progaudio: mediaPlansData[0].mp_progaudio,
            mp_progooh: mediaPlansData[0].mp_progooh,
            mp_influencers: mediaPlansData[0].mp_influencers,
          });
        }

        // Helper function to normalize boolean values from API
        const normalizeBoolean = (value: any): boolean => {
          if (typeof value === 'boolean') return value;
          if (typeof value === 'string') {
            return value.toLowerCase() === 'true' || value === '1';
          }
          if (typeof value === 'number') return value === 1;
          return false;
        };

        // Stored status wins. Past end date is a separate scheduleEnded hint only.
        const processedPlans = mediaPlansData.map((plan) => {
          const normalizedPlan = {
            ...plan,
            mp_television: normalizeBoolean(plan.mp_television),
            mp_radio: normalizeBoolean(plan.mp_radio),
            mp_newspaper: normalizeBoolean(plan.mp_newspaper),
            mp_magazines: normalizeBoolean(plan.mp_magazines),
            mp_ooh: normalizeBoolean(plan.mp_ooh),
            mp_cinema: normalizeBoolean(plan.mp_cinema),
            mp_digidisplay: normalizeBoolean(plan.mp_digidisplay),
            mp_digiaudio: normalizeBoolean(plan.mp_digiaudio),
            mp_digivideo: normalizeBoolean(plan.mp_digivideo),
            mp_bvod: normalizeBoolean(plan.mp_bvod),
            mp_integration: normalizeBoolean(plan.mp_integration),
            mp_search: normalizeBoolean(plan.mp_search),
            mp_socialmedia: normalizeBoolean(plan.mp_socialmedia),
            mp_progdisplay: normalizeBoolean(plan.mp_progdisplay),
            mp_progvideo: normalizeBoolean(plan.mp_progvideo),
            mp_progbvod: normalizeBoolean(plan.mp_progbvod),
            mp_progaudio: normalizeBoolean(plan.mp_progaudio),
            mp_progooh: normalizeBoolean(plan.mp_progooh),
            mp_influencers: normalizeBoolean(plan.mp_influencers),
            campaign_status: normalizeStoredCampaignStatus(plan.campaign_status),
            scheduleEnded: isScheduleEnded(plan.campaign_end_date),
          }
          return normalizedPlan
        })

        setMediaPlans(processedPlans as MediaPlan[])
        setError(null)
      } catch (err) {
        console.error("Error fetching media plans:", err)
        setError(err instanceof Error ? err.message : "An unknown error occurred")
        // Keep prior rows if any; do not pretend the list is empty on failure.
      } finally {
        setLoading(false)
      }
    }

    fetchMediaPlans()
  }, [])

  // Hydrate search + FY from URL once; then keep URL in sync.
  useEffect(() => {
    if (urlHydrated) return
    setSearchTerm(searchParams.get("q") ?? "")
    setFyFilter(parseAuFySearchParam(searchParams.get("fy")))
    setUrlHydrated(true)
  }, [searchParams, urlHydrated])

  // Load Home-shared pinned clients once auth settles.
  useEffect(() => {
    if (pinsHydrated) return
    if (authLoading) return
    if (!dashboardStorageUserId || !savedViewsListKey) {
      setPinsHydrated(true)
      return
    }
    let loadedViews: SavedDashboardViewRecord[] = []
    try {
      loadedViews = parseSavedViewsFromStorageJson(
        window.localStorage.getItem(savedViewsListKey),
      )
      if (loadedViews.length === 0 && legacyPinnedClientsKey) {
        const legacyClients = readClientsFromLegacyPinKey(legacyPinnedClientsKey)
        if (legacyClients.length > 0) {
          loadedViews = upsertPinnedClientsView([], legacyClients)
          try {
            window.localStorage.setItem(
              savedViewsListKey,
              serializeSavedViewsToStorageJson(loadedViews),
            )
          } catch {
            // ignore
          }
        }
      }
    } catch {
      loadedViews = []
    }
    setSavedViews(loadedViews)
    const pinned = findPinnedClientsView(loadedViews)
    if (pinned?.filters.clients?.length) {
      setSelectedClients([...pinned.filters.clients])
    }
    setPinsHydrated(true)
  }, [
    pinsHydrated,
    authLoading,
    dashboardStorageUserId,
    savedViewsListKey,
    legacyPinnedClientsKey,
  ])

  useEffect(() => {
    if (!urlHydrated) return
    const params = new URLSearchParams(searchParams.toString())
    const q = searchTerm.trim()
    if (q) params.set("q", q)
    else params.delete("q")
    const fyParam = serializeAuFySearchParam(fyFilter)
    if (fyParam) params.set("fy", fyParam)
    else params.delete("fy")
    const next = params.toString()
    const current = searchParams.toString()
    if (next === current) return
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false })
  }, [searchTerm, fyFilter, urlHydrated, pathname, router, searchParams])

  // Filter media plans by status from filtered results
  const getMediaPlansByStatus = (status: string) => {
    return filteredPlans.filter(plan => plan.campaign_status === status);
  };

  // Search + client pins + AU FY overlap — fail-closed: never throw on missing string fields
  useEffect(() => {
    const selectedClientKeys = new Set(
      selectedClients.map((c) => normalizeClientFilterValue(c)).filter(Boolean),
    )
    const filtered = mediaPlans.filter((plan) => {
      if (
        !campaignOverlapsAuFinancialYear(
          plan.campaign_start_date,
          plan.campaign_end_date,
          fyFilter,
        )
      ) {
        return false
      }
      if (selectedClientKeys.size > 0) {
        const clientKey = normalizeClientFilterValue(plan.mp_client_name || "")
        if (!selectedClientKeys.has(clientKey)) return false
      }
      if (!searchTerm.trim()) return true
      return matchesMediaPlanSearch(plan, searchTerm)
    })
    setFilteredPlans(filtered)
  }, [searchTerm, selectedClients, fyFilter, mediaPlans])

  const getMediaTypeTags = (plan: MediaPlan) =>
    campaignMediaTypeTagLabels(plan).map((label) => (
      <MediaChannelTag key={`${plan.id}-${label}`} label={label} />
    ))

  // Get status badge color
  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case "Draft":
        return "bg-surface-muted text-muted-foreground"
      case "Planned":
        return "bg-pacing-on-track-bg text-status-on-track-fg"
      case "Approved":
        return "bg-pacing-ahead-bg text-status-ahead-fg"
      case "Booked":
        return "bg-primary text-primary-foreground"
      case "Completed":
        return "bg-pacing-ahead-bg text-status-ahead-fg"
      case "Cancelled":
        return "bg-pacing-critical-bg text-status-critical-fg"
      default:
        return "bg-surface-muted text-muted-foreground"
    }
  }

  const clearCampaignFilters = useCallback(() => {
    // Active filter only — do not wipe FY or saved client pins (Home clear semantics).
    setSearchTerm("")
    setSelectedClients([])
  }, [])

  const handleFiltersChange = useCallback((next: DashboardViewFilters) => {
    setSearchTerm(next.campaignSearch)
    setSelectedClients([...next.clients])
  }, [])

  const writeSavedViewsToStorage = useCallback(
    (views: SavedDashboardViewRecord[]) => {
      if (!savedViewsListKey) return
      try {
        window.localStorage.setItem(savedViewsListKey, serializeSavedViewsToStorageJson(views))
      } catch {
        // ignore
      }
    },
    [savedViewsListKey],
  )

  const handleSaveSelectedClients = useCallback(() => {
    if (!savedViewsListKey) return
    const views = upsertPinnedClientsView(savedViews, selectedClients)
    setSavedViews(views)
    writeSavedViewsToStorage(views)
    if (legacyPinnedClientsKey) {
      try {
        if (selectedClients.length === 0) {
          window.localStorage.removeItem(legacyPinnedClientsKey)
        } else {
          window.localStorage.setItem(legacyPinnedClientsKey, JSON.stringify(selectedClients))
        }
      } catch {
        // ignore
      }
    }
    setSavedViewJustSaved(true)
    window.setTimeout(() => setSavedViewJustSaved(false), 1500)
  }, [
    savedViewsListKey,
    savedViews,
    selectedClients,
    writeSavedViewsToStorage,
    legacyPinnedClientsKey,
  ])

  const handleClearAllSavedViews = useCallback(() => {
    if (!savedViewsListKey) return
    try {
      window.localStorage.removeItem(savedViewsListKey)
    } catch {
      // ignore
    }
    if (legacyPinnedClientsKey) {
      try {
        window.localStorage.removeItem(legacyPinnedClientsKey)
      } catch {
        // ignore
      }
    }
    setSavedViews([])
    setSavedViewJustSaved(false)
  }, [savedViewsListKey, legacyPinnedClientsKey])

  const formatDate = useCallback(
    (value: string) => safeFormatDate(value, "dd/MM/yyyy", value || "—"),
    [],
  )

  const fyIsDefault = fyFilter === parseAuFySearchParam(null)
  const filtersActive =
    Boolean(searchTerm.trim()) || selectedClients.length > 0 || !fyIsDefault
  const countActive = filtersActive

  const campaignsViewState = useMemo(
    () =>
      resolveListViewState({
        loading,
        error,
        items: mediaPlans,
        visible: filteredPlans,
        filtersActive,
        clear: clearCampaignFilters,
        retry: () => {
          setError(null)
          setLoading(true)
          window.location.reload()
        },
        freshness: {
          stale: listMayBeStale,
          fetchedAt: listFetchedAt,
        },
      }),
    [
      loading,
      error,
      mediaPlans,
      filteredPlans,
      filtersActive,
      clearCampaignFilters,
      listMayBeStale,
      listFetchedAt,
    ]
  )

  return (
    <div className="flex h-full w-full flex-col gap-6 px-4 pb-10 pt-6 max-[375px]:pb-28 md:px-6">
      <MediaPlanEditorHero
        className="mb-1"
        compact
        title="Campaigns"
        detail={
          <p>Search campaigns, create a new plan, and jump into edits or dashboards.</p>
        }
        actions={
          <Button
            type="button"
            className="h-9 whitespace-nowrap"
            onClick={() => router.push("/mediaplans/create")}
          >
            <PlusCircle className="mr-2 h-4 w-4" />
            Create Campaign
          </Button>
        }
      />

      <DashboardFilterBar
        filters={dashboardFilters}
        onFiltersChange={handleFiltersChange}
        clientFilterOptions={clientFilterOptions}
        savedViews={savedViews}
        savedViewsListKey={savedViewsListKey}
        savedViewJustSaved={savedViewJustSaved}
        onSaveSelectedClients={handleSaveSelectedClients}
        onClearAllSavedViews={handleClearAllSavedViews}
        onClearFilters={clearCampaignFilters}
      />

      <div className="mb-4 flex flex-col gap-3 pt-4 scroll-mt-4 sm:flex-row sm:items-center sm:justify-between">
        <span
          className="inline-flex h-9 w-[11.5rem] shrink-0 items-center text-xs tabular-nums text-muted-foreground"
          aria-live="polite"
        >
          {loading ? (
            countActive ? (
              <span className="inline-block h-3 w-24 animate-pulse rounded bg-muted" aria-hidden />
            ) : null
          ) : countActive ? (
            <>
              {filteredPlans.length} of {mediaPlans.length} campaigns
            </>
          ) : null}
        </span>
        <div className="flex flex-wrap items-center gap-3">
          <AuFinancialYearFilterPills value={fyFilter} onChange={setFyFilter} />
          <ListGridToggle value={listGridMode} onChange={setListGridMode} />
        </div>
      </div>

      <PanelRow>
          <PanelRowCell
            span="full"
            className="space-y-4 bg-surface-muted py-6 -mx-4 px-4 md:-mx-6 md:px-6"
          >
          {campaignsViewState.status === "ready" &&
          campaignsViewState.freshness?.stale ? (
            <div
              role="status"
              className="rounded-card border border-pacing-behind bg-pacing-behind-bg px-4 py-3 text-sm text-status-behind-fg"
            >
              Campaign list may be out of date
              {campaignsViewState.freshness.fetchedAt
                ? ` (last refreshed ${format(new Date(campaignsViewState.freshness.fetchedAt), "HH:mm")})`
                : ""}
              {" — "}a newly saved campaign may not appear yet.
            </div>
          ) : null}

          <ViewStateBoundary
            state={campaignsViewState}
            errorTitle="Couldn't load campaigns"
            emptyTitle="No campaigns yet"
            emptyMessage="Create a media plan to get started."
            emptyAction={
              <Button type="button" onClick={() => router.push("/mediaplans/create")}>
                <PlusCircle className="mr-2 h-4 w-4" />
                Create Campaign
              </Button>
            }
            filteredEmptyTitle="No campaigns match these filters"
            filteredEmptyMessage="Clear search and client filters to see more campaigns, or adjust the financial year."
            loadingRows={6}
          >
            {() => (
            <div className="space-y-6">
              {CAMPAIGN_STATUSES.map((status) => {
                const plans = getMediaPlansByStatus(status)
                const sortedPlans = applySortForStatus(plans, status)
                const shouldScrollTable = sortedPlans.length > 12

                return (
                  <Panel key={status} className="overflow-hidden border-border/40 shadow-sm">
                    <PanelHeader className="border-b border-border/40 bg-muted/20 pb-3">
                      <PanelTitle className="flex items-center gap-2.5">
                        <div
                          className={cn(
                            "h-2.5 w-2.5 rounded-full",
                            status === "Booked" && "bg-primary",
                            status === "Approved" && "bg-pacing-ahead",
                            status === "Planned" && "bg-pacing-on-track",
                            status === "Draft" && "bg-muted-foreground",
                            status === "Completed" && "bg-pacing-ahead",
                            status === "Cancelled" && "bg-pacing-critical",
                          )}
                        />
                        <span className="text-sm font-semibold">{status}</span>
                        <span className="text-xs tabular-nums text-muted-foreground">
                          ({plans.length})
                        </span>
                      </PanelTitle>
                      <PanelActions />
                    </PanelHeader>

                    <PanelContent className="px-0 pb-0 pt-0">
                      {plans.length === 0 ? (
                        <div className="py-12 text-center">
                          <span className="text-sm text-muted-foreground/70">
                            No {status.toLowerCase()} plans
                          </span>
                        </div>
                      ) : listGridMode === "grid" ? (
                        <div className="px-4 py-4">
                          <div className={dashboardCampaignGridClassName(shouldScrollTable)}>
                            {sortedPlans.map((plan) => (
                              <DashboardCampaignPlanCard
                                key={plan.id}
                                plan={{
                                  id: plan.id,
                                  mp_clientname: plan.mp_client_name,
                                  mp_campaignname: plan.mp_campaignname || plan.campaign_name || "",
                                  mp_mba_number: plan.mba_number,
                                  mp_version: plan.version_number,
                                  mp_campaignstatus: plan.campaign_status,
                                  mp_campaigndates_start: plan.campaign_start_date,
                                  mp_campaigndates_end: plan.campaign_end_date,
                                  mp_campaignbudget: plan.mp_campaignbudget,
                                  published_version_id: plan.published_version_id,
                                }}
                                formatDate={formatDate}
                                formatCurrency={formatAUD}
                                mediaTypeTags={getMediaTypeTags(plan)}
                                showStatus={true}
                                statusBadgeClassName={getStatusBadgeColor(plan.campaign_status)}
                                clientSlug={slugifyClientName(plan.mp_client_name)}
                                canEdit
                              />
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div
                          className={`overflow-x-auto ${
                            shouldScrollTable ? "max-h-[1008px] overflow-y-auto" : ""
                          }`}
                        >
                          <Table>
                            <TableHeader className="sticky top-0 z-10 bg-muted/30">
                              <TableRow className="border-b border-border/40 hover:bg-transparent">
                                <SortableTableHeader
                                  label="ID"
                                  direction={getSortDirection(status, "id")}
                                  onToggle={() => toggleSortForStatus(status, "id")}
                                  className="w-16"
                                />
                                <SortableTableHeader
                                  label="Client Name"
                                  direction={getSortDirection(status, "client")}
                                  onToggle={() => toggleSortForStatus(status, "client")}
                                  className="w-32"
                                />
                                <SortableTableHeader
                                  label="MBA Number"
                                  direction={getSortDirection(status, "mba")}
                                  onToggle={() => toggleSortForStatus(status, "mba")}
                                  className="w-24"
                                />
                                <SortableTableHeader
                                  label="Campaign Name"
                                  direction={getSortDirection(status, "campaign")}
                                  onToggle={() => toggleSortForStatus(status, "campaign")}
                                  className="w-40"
                                />
                                <SortableTableHeader
                                  label="Version"
                                  direction={getSortDirection(status, "version")}
                                  onToggle={() => toggleSortForStatus(status, "version")}
                                  className="w-20"
                                />
                                <SortableTableHeader
                                  label="Budget"
                                  direction={getSortDirection(status, "budget")}
                                  onToggle={() => toggleSortForStatus(status, "budget")}
                                  className="w-24"
                                />
                                <SortableTableHeader
                                  label="Start Date"
                                  direction={getSortDirection(status, "startDate")}
                                  onToggle={() => toggleSortForStatus(status, "startDate")}
                                  className="w-24"
                                />
                                <SortableTableHeader
                                  label="End Date"
                                  direction={getSortDirection(status, "endDate")}
                                  onToggle={() => toggleSortForStatus(status, "endDate")}
                                  className="w-24"
                                />
                                <TableHead className="w-48">Media Types</TableHead>
                                <TableHead className="text-left">Actions</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody className="[&_tr:nth-child(even)]:bg-muted/5">
                              {sortedPlans.map((plan) => (
                                <TableRow
                                  key={plan.id}
                                  className="border-b border-border/20 transition-colors duration-100 hover:bg-muted/30"
                                >
                                  <TableCell className="w-16 font-medium">{plan.id}</TableCell>
                                  <TableCell className="w-32">{plan.mp_client_name}</TableCell>
                                  <TableCell className="w-24">{plan.mba_number}</TableCell>
                                  <TableCell className="w-40">{plan.mp_campaignname || plan.campaign_name}</TableCell>
                                  <TableCell className="w-20">{plan.version_number}</TableCell>
                                  <TableCell className="w-24">{formatAUD(plan.mp_campaignbudget)}</TableCell>
                                  <TableCell className="w-24">{formatDate(plan.campaign_start_date)}</TableCell>
                                  <TableCell className="w-24">{formatDate(plan.campaign_end_date)}</TableCell>
                                  <TableCell className="w-48">
                                    <div className={mediaChannelTagRowClassName}>{getMediaTypeTags(plan)}</div>
                                  </TableCell>
                                  <TableCell className="w-full min-w-[10rem] align-top">
                                    <CampaignRowActions
                                      layout="stacked"
                                      mbaNumber={plan.mba_number}
                                      versionNumber={plan.version_number}
                                      clientSlug={slugifyClientName(plan.mp_client_name)}
                                      canEdit
                                      hasPublishedVersion={hasPublishedVersionFromPointer(
                                        plan.published_version_id,
                                      )}
                                    />
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </PanelContent>
                  </Panel>
                )
              })}
            </div>
            )}
          </ViewStateBoundary>
          </PanelRowCell>
      </PanelRow>
    </div>
  )
}

export default function MediaPlansPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full w-full flex-col gap-6 px-4 pb-10 pt-6 md:px-6">
          <p className="text-sm text-muted-foreground">Loading campaigns…</p>
        </div>
      }
    >
      <MediaPlansPageInner />
    </Suspense>
  )
}
