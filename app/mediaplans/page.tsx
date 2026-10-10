"use client"

import { useState, useEffect, useMemo, useCallback, Suspense } from "react"
import Link from "next/link"
import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import { ViewStateBoundary } from "@/components/ui/ViewStateBoundary"
import { resolveListViewState } from "@/lib/ui/viewState"
import { format } from "date-fns"
import { Download, PlusCircle } from "lucide-react"
import { MediaChannelTag } from "@/components/dashboard/MediaChannelTag"
import { campaignMediaTypeTagLabels } from "@/lib/dashboard/campaignMediaTypeTags"
import { PanelRow, PanelRowCell } from "@/components/layout/PanelRow"
import { PageHeader } from "@/components/layout/PageHeader"
import { useCampaignsLayout } from "@/lib/hooks/useCampaignsLayout"
import { ListGridToggle } from "@/components/ui/list-grid-toggle"
import { DashboardCampaignPlanCard, dashboardCampaignGridClassName } from "@/components/dashboard/DashboardEntityCards"
import { CampaignStatusBadge } from "@/components/campaign/CampaignStatusBadge"
import { DataTable, type DataTableColumn } from "@/components/ui/data-table"
import { DashboardFilterBar } from "@/components/dashboard/DashboardFilterBar"
import { formatAUD } from "@/lib/format/money"
import { safeFormatDate } from "@/lib/dashboard/safeFormatDate"
import {
  isScheduleEnded,
  normalizeStoredCampaignStatus,
} from "@/lib/mediaplans/campaignListStatus"
import {
  CAMPAIGN_LIST_CHIP_LABEL,
  CAMPAIGN_LIST_CHIPS,
  campaignListCsvRows,
  filterCampaignsByStatusChip,
  formatCampaignDateRange,
  mediaPillWindow,
  type CampaignListChip,
} from "@/lib/mediaplans/campaignListView"
import { matchesMediaPlanSearch } from "@/lib/mediaplans/matchesMediaPlanSearch"
import { segmentChipClass } from "@/components/layout/navChip"
import { downloadCsvRows } from "@/lib/utils/csv-export"
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

function campaignEditHref(plan: MediaPlan): string {
  return `/mediaplans/mba/${encodeURIComponent(plan.mba_number)}/edit?version=${plan.version_number}`
}

function CampaignMediaPills({ plan }: { plan: MediaPlan }) {
  const { shown, extra } = mediaPillWindow(campaignMediaTypeTagLabels(plan))
  return (
    <div className="flex flex-wrap items-center gap-1">
      {shown.map((label, index) => (
        <MediaChannelTag key={`${label}-${index}`} label={label} />
      ))}
      {extra > 0 ? <span className="text-xs text-muted-foreground">+{extra}</span> : null}
    </div>
  )
}

function MediaPlansPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const { user, isLoading: authLoading } = useAuthContext()
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
  const [statusChip, setStatusChip] = useState<CampaignListChip>("all")
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
  const { mode: layoutMode, setMode: setLayoutMode } = useCampaignsLayout(dashboardStorageUserId)

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
  
        // Handle both MediaPlanMaster and MediaPlanVersions data structures
        const mediaPlansData = Array.isArray(data) ? data : [data];
        
        // Debug: Log media type flags for first plan

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

  const visiblePlans = useMemo(() => {
    const matched = filterCampaignsByStatusChip(filteredPlans, statusChip)
    return [...matched].sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0))
  }, [filteredPlans, statusChip])

  const tableColumns = useMemo<DataTableColumn<MediaPlan>[]>(
    () => [
      {
        id: "campaign",
        header: "Campaign",
        accessor: (plan) => plan.mp_campaignname || plan.campaign_name || "",
        cell: (plan) => (
          <span className="block min-w-[12rem]">
            <span className="block font-semibold text-foreground">
              {plan.mp_campaignname || plan.campaign_name || "—"}
            </span>
            <span className="block text-xs text-muted-foreground">{plan.mp_client_name}</span>
          </span>
        ),
      },
      {
        id: "mba",
        header: "MBA",
        accessor: (plan) => plan.mba_number || "",
      },
      {
        id: "status",
        header: "Status",
        accessor: (plan) => plan.campaign_status || "",
        sortable: false,
        cell: (plan) => (
          <CampaignStatusBadge
            status={plan.campaign_status}
            startDate={plan.campaign_start_date}
            endDate={plan.campaign_end_date}
          />
        ),
      },
      {
        id: "dates",
        header: "Dates",
        accessor: (plan) => plan.campaign_start_date || "",
        cell: (plan) => formatCampaignDateRange(plan.campaign_start_date, plan.campaign_end_date) || "—",
      },
      {
        id: "media",
        header: "Media types",
        accessor: (plan) => campaignMediaTypeTagLabels(plan).join(", "),
        sortable: false,
        cell: (plan) => <CampaignMediaPills plan={plan} />,
      },
      {
        id: "budget",
        header: "Budget",
        align: "right",
        accessor: (plan) => plan.mp_campaignbudget || 0,
        cell: (plan) => <span className="num">{formatAUD(plan.mp_campaignbudget)}</span>,
      },
      {
        id: "version",
        header: "Version",
        align: "right",
        accessor: (plan) => plan.version_number,
      },
      {
        id: "open",
        header: "Open",
        accessor: () => "",
        sortable: false,
        csv: false,
        cell: (plan) => (
          <Link
            href={campaignEditHref(plan)}
            className="text-sm font-medium text-foreground"
            onClick={(event) => event.stopPropagation()}
          >
            Open
          </Link>
        ),
      },
    ],
    [],
  )

  const clearCampaignFilters = useCallback(() => {
    // Active filter only — do not wipe FY or saved client pins (Home clear semantics).
    setSearchTerm("")
    setSelectedClients([])
    setStatusChip("all")
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
    Boolean(searchTerm.trim()) ||
    selectedClients.length > 0 ||
    !fyIsDefault ||
    statusChip !== "all"

  const exportFilteredCsv = useCallback(() => {
    downloadCsvRows(
      campaignListCsvRows(visiblePlans, {
        mediaLabels: (row) => campaignMediaTypeTagLabels(row),
        formatBudget: (amount) => formatAUD(amount ?? 0),
      }),
      "campaigns",
    )
  }, [visiblePlans])

  const campaignsViewState = useMemo(
    () =>
      resolveListViewState({
        loading,
        error,
        items: mediaPlans,
        visible: visiblePlans,
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
      visiblePlans,
      filtersActive,
      clearCampaignFilters,
      listMayBeStale,
      listFetchedAt,
    ]
  )

  return (
    <div className="flex h-full w-full flex-col gap-6 px-4 pb-10 pt-6 max-[375px]:pb-28 md:px-6">
      <PageHeader
        title="Campaigns"
        lede="Every media plan, newest first. Live and Completed come from campaign dates."
        actions={
          <>
            <Button
              type="button"
              variant="ghost"
              className="h-9 whitespace-nowrap"
              disabled={visiblePlans.length === 0}
              onClick={exportFilteredCsv}
            >
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
            <Button
              type="button"
              className="h-9 whitespace-nowrap"
              onClick={() => router.push("/mediaplans/create")}
            >
              <PlusCircle className="mr-2 h-4 w-4" />
              Create campaign
            </Button>
          </>
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
        searchPlaceholder="Search client, campaign or MBA"
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
        <div className="flex flex-wrap items-center gap-3">
          <AuFinancialYearFilterPills value={fyFilter} onChange={setFyFilter} />
          <ListGridToggle
            value={layoutMode === "cards" ? "grid" : "list"}
            onChange={(next) => setLayoutMode(next === "grid" ? "cards" : "table")}
          />
        </div>
      </div>

      <div role="group" aria-label="Campaign status" className="flex flex-wrap gap-1">
        {CAMPAIGN_LIST_CHIPS.map((chip) => (
          <button
            key={chip}
            type="button"
            className={segmentChipClass(statusChip === chip)}
            aria-pressed={statusChip === chip}
            onClick={() => setStatusChip(chip)}
          >
            {CAMPAIGN_LIST_CHIP_LABEL[chip]}
          </button>
        ))}
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
              className="rounded-card border border-tone-attention bg-tone-attention-bg px-4 py-3 text-sm text-tone-attention-fg"
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
                Create campaign
              </Button>
            }
            filteredEmptyTitle="No campaigns match these filters"
            filteredEmptyMessage="Clear search, status or client filters to see more campaigns, or adjust the financial year."
            loadingRows={6}
          >
            {() =>
              layoutMode === "cards" ? (
                <div className={dashboardCampaignGridClassName(visiblePlans.length > 12)}>
                  {visiblePlans.map((plan) => (
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
                      mediaTypeTags={<CampaignMediaPills plan={plan} />}
                      showStatus
                      statusBadgeClassName=""
                      clientSlug={slugifyClientName(plan.mp_client_name)}
                      canEdit
                    />
                  ))}
                </div>
              ) : (
                <DataTable
                  columns={tableColumns}
                  rows={visiblePlans}
                  getRowId={(plan) => String(plan.id)}
                  onRowClick={(plan) => router.push(campaignEditHref(plan))}
                />
              )
            }
          </ViewStateBoundary>
          {!loading && !error ? (
            <p className="text-xs tabular-nums text-muted-foreground" aria-live="polite">
              {visiblePlans.length} {visiblePlans.length === 1 ? "campaign" : "campaigns"}
            </p>
          ) : null}
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
