"use client"

import { useState, useEffect, useMemo, useCallback, Suspense } from "react"
import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import { ViewStateBoundary } from "@/components/ui/ViewStateBoundary"
import { resolveListViewState } from "@/lib/ui/viewState"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { format } from "date-fns"
import { PlusCircle, Search, X } from "lucide-react"
import { MediaChannelTag, mediaChannelTagRowClassName } from "@/components/dashboard/MediaChannelTag"
import { cn } from "@/lib/utils"
import { compareValues, SortableTableHeader, SortDirection } from "@/components/ui/sortable-table-header"
import { PanelRow, PanelRowCell } from "@/components/layout/PanelRow"
import { MediaPlanEditorHero } from "@/components/mediaplans/MediaPlanEditorHero"
import { Panel, PanelActions, PanelContent, PanelHeader, PanelTitle } from "@/components/layout/Panel"
import { useListGridLayoutPreference } from "@/lib/hooks/useListGridLayoutPreference"
import { ListGridToggle } from "@/components/ui/list-grid-toggle"
import { DashboardCampaignPlanCard, dashboardCampaignGridClassName } from "@/components/dashboard/DashboardEntityCards"
import { formatAUD } from "@/lib/format/money"
import { safeFormatDate } from "@/lib/dashboard/safeFormatDate"
import {
  CAMPAIGN_LIST_STATUSES,
  isInMarketNow,
  isScheduleEnded,
  normalizeStoredCampaignStatus,
} from "@/lib/mediaplans/campaignListStatus"

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
  const { mode: listGridMode, setMode: setListGridMode } = useListGridLayoutPreference()
  const [mediaPlans, setMediaPlans] = useState<MediaPlan[]>([])
  const [filteredPlans, setFilteredPlans] = useState<MediaPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [listMayBeStale, setListMayBeStale] = useState(false)
  const [listFetchedAt, setListFetchedAt] = useState<number | null>(null)
  const [searchTerm, setSearchTerm] = useState(() => searchParams.get("q") ?? "")
  const [sortStates, setSortStates] = useState<Record<string, SortState>>({})
  const [urlHydrated, setUrlHydrated] = useState(false)

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

  // Hydrate search from URL once; then keep URL in sync with the box.
  useEffect(() => {
    if (urlHydrated) return
    setSearchTerm(searchParams.get("q") ?? "")
    setUrlHydrated(true)
  }, [searchParams, urlHydrated])

  useEffect(() => {
    if (!urlHydrated) return
    const params = new URLSearchParams(searchParams.toString())
    const q = searchTerm.trim()
    if (q) params.set("q", q)
    else params.delete("q")
    const next = params.toString()
    const current = searchParams.toString()
    if (next === current) return
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false })
  }, [searchTerm, urlHydrated, pathname, router, searchParams])

  // Filter media plans by status from filtered results
  const getMediaPlansByStatus = (status: string) => {
    return filteredPlans.filter(plan => plan.campaign_status === status);
  };

  // Search functionality
  useEffect(() => {
    if (!searchTerm) {
      setFilteredPlans(mediaPlans);
      return;
    }

    const filtered = mediaPlans.filter(plan => {
      const searchLower = searchTerm.toLowerCase();
      return (
        plan.mp_client_name.toLowerCase().includes(searchLower) ||
        (plan.campaign_name?.toLowerCase().includes(searchLower) ?? false) ||
        plan.mba_number.toLowerCase().includes(searchLower) ||
        (plan.brand && plan.brand.toLowerCase().includes(searchLower))
      );
    });

    setFilteredPlans(filtered);
  }, [searchTerm, mediaPlans]);

  // Get media type tags for a campaign
  const getMediaTypeTags = (plan: MediaPlan) => {
    // Helper to safely check if a media type is enabled
    const isEnabled = (value: any): boolean => {
      if (typeof value === 'boolean') return value === true;
      if (typeof value === 'string') {
        return value.toLowerCase() === 'true' || value === '1';
      }
      if (typeof value === 'number') return value === 1;
      return false;
    };

    /** Labels aligned with `lib/api/dashboard.ts` campaign `mediaTypes` (matches dashboard campaign cards / charts). */
    const mediaTypes = [
      { label: "Television", enabled: isEnabled(plan.mp_television) },
      { label: "Radio", enabled: isEnabled(plan.mp_radio) },
      { label: "Newspaper", enabled: isEnabled(plan.mp_newspaper) },
      { label: "Magazines", enabled: isEnabled(plan.mp_magazines) },
      { label: "OOH", enabled: isEnabled(plan.mp_ooh) },
      { label: "Cinema", enabled: isEnabled(plan.mp_cinema) },
      { label: "Digital Display", enabled: isEnabled(plan.mp_digidisplay) },
      { label: "Digital Audio", enabled: isEnabled(plan.mp_digiaudio) },
      { label: "Digital Video", enabled: isEnabled(plan.mp_digivideo) },
      { label: "BVOD", enabled: isEnabled(plan.mp_bvod) },
      { label: "Integration", enabled: isEnabled(plan.mp_integration) },
      { label: "Search", enabled: isEnabled(plan.mp_search) },
      { label: "Social Media", enabled: isEnabled(plan.mp_socialmedia) },
      { label: "Programmatic Display", enabled: isEnabled(plan.mp_progdisplay) },
      { label: "Programmatic Video", enabled: isEnabled(plan.mp_progvideo) },
      { label: "Programmatic BVOD", enabled: isEnabled(plan.mp_progbvod) },
      { label: "Programmatic Audio", enabled: isEnabled(plan.mp_progaudio) },
      { label: "Programmatic OOH", enabled: isEnabled(plan.mp_progooh) },
      { label: "Influencers", enabled: isEnabled(plan.mp_influencers) },
    ]

    const enabledTypes = mediaTypes.filter(({ enabled }) => enabled === true)

    if (enabledTypes.length > 0) {
      console.log(`Plan ${plan.id} - Enabled media types:`, enabledTypes.map((t) => t.label))
    }

    return enabledTypes.map(({ label }) => (
      <MediaChannelTag key={`${plan.id}-${label}`} label={label} />
    ))
  }

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

  const clearCampaignSearch = useCallback(() => setSearchTerm(""), [])

  const formatDate = useCallback(
    (value: string) => safeFormatDate(value, "dd/MM/yyyy", value || "—"),
    [],
  )

  const inMarketPlans = useMemo(
    () => filteredPlans.filter((plan) => isInMarketNow(plan)),
    [filteredPlans],
  )

  const campaignsViewState = useMemo(
    () =>
      resolveListViewState({
        loading,
        error,
        items: mediaPlans,
        visible: filteredPlans,
        filtersActive: Boolean(searchTerm.trim()),
        clear: clearCampaignSearch,
        retry: () => {
          setError(null)
          setLoading(true)
          window.location.reload()
        },
      }),
    [loading, error, mediaPlans, filteredPlans, searchTerm, clearCampaignSearch]
  )

  const searchActive = Boolean(searchTerm.trim())

  return (
    <div className="w-full max-w-none space-y-6 px-4 pb-12 pt-0 md:px-6">
      <MediaPlanEditorHero
        className="mb-2 pt-6 md:pt-8"
        title="Campaigns"
        detail={
          <p>Search campaigns, create a new plan, and jump into edits or dashboards.</p>
        }
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <ListGridToggle value={listGridMode} onChange={setListGridMode} />
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search campaigns..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-72 border-border/50 bg-background/80 pl-10 pr-9 backdrop-blur-sm"
                  aria-label="Search campaigns"
                />
                {searchActive ? (
                  <button
                    type="button"
                    onClick={clearCampaignSearch}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-1 text-muted-foreground hover:text-foreground"
                    aria-label="Clear search"
                    title="Clear search"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
              {searchActive ? (
                <span className="text-xs tabular-nums text-muted-foreground">
                  {filteredPlans.length} of {mediaPlans.length} campaigns
                </span>
              ) : null}
            </div>
            <Button onClick={() => router.push("/mediaplans/create")}>
              <PlusCircle className="mr-2 h-4 w-4" />
              Create Campaign
            </Button>
          </div>
        }
      />
      <PanelRow>
          <PanelRowCell
            span="full"
            className="space-y-4 bg-surface-muted py-6 -mx-4 px-4 md:-mx-6 md:px-6"
          >
          {listMayBeStale && campaignsViewState.status === "ready" ? (
            <div
              role="status"
              className="rounded-card border border-pacing-behind bg-pacing-behind-bg px-4 py-3 text-sm text-status-behind-fg"
            >
              Campaign list may be out of date
              {listFetchedAt
                ? ` (last refreshed ${format(new Date(listFetchedAt), "HH:mm")})`
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
            filteredEmptyTitle="No campaigns match this search"
            filteredEmptyMessage="Clear the search to see all campaigns again."
            loadingRows={6}
          >
            {() => (
            <div className="space-y-6">
              {inMarketPlans.length > 0 ? (
                <Panel className="overflow-hidden border-border/40 shadow-sm">
                  <PanelHeader className="border-b border-border/40 bg-muted/20 pb-3">
                    <PanelTitle className="flex items-center gap-2.5">
                      <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-pacing-ahead" />
                      <span className="text-sm font-semibold">In market now</span>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        ({inMarketPlans.length})
                      </span>
                    </PanelTitle>
                    <PanelActions />
                  </PanelHeader>
                  <PanelContent className="px-4 py-3">
                    <p className="mb-3 text-xs text-muted-foreground">
                      Booked or Approved campaigns whose dates include today (stored status — not
                      date-invented).
                    </p>
                    <ul className="space-y-2">
                      {inMarketPlans.slice(0, 8).map((plan) => (
                        <li
                          key={`live-${plan.id}`}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/50 bg-card px-3 py-2 text-sm"
                        >
                          <div className="min-w-0">
                            <p className="truncate font-medium text-foreground">
                              {plan.mp_campaignname || plan.campaign_name || plan.mba_number}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {plan.mp_client_name} · {plan.mba_number} · {plan.campaign_status}
                              {plan.scheduleEnded ? " · schedule ended" : ""}
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 shrink-0 text-xs"
                            onClick={() => {
                              const slug = slugifyClientName(plan.mp_client_name)
                              if (!slug) {
                                router.push(
                                  `/mediaplans/mba/${plan.mba_number}/edit?version=${plan.version_number}`,
                                )
                                return
                              }
                              router.push(`/dashboard/${slug}/${plan.mba_number}`)
                            }}
                          >
                            Open
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </PanelContent>
                </Panel>
              ) : null}
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
                                }}
                                formatDate={formatDate}
                                formatCurrency={formatAUD}
                                mediaTypeTags={getMediaTypeTags(plan)}
                                showStatus={true}
                                statusBadgeClassName={getStatusBadgeColor(plan.campaign_status)}
                                onEdit={() =>
                                  router.push(
                                    `/mediaplans/mba/${plan.mba_number}/edit?version=${plan.version_number}`
                                  )
                                }
                                onView={() => {
                                  const slug = slugifyClientName(plan.mp_client_name)
                                  if (!slug) return
                                  router.push(`/dashboard/${slug}/${plan.mba_number}`)
                                }}
                                viewDisabled={!slugifyClientName(plan.mp_client_name)}
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
                                <TableHead className="w-20">Actions</TableHead>
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
                                  <TableCell className="w-20">
                                    <div className="flex items-center gap-1.5">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 text-xs"
                                        onClick={() =>
                                          router.push(
                                            `/mediaplans/mba/${plan.mba_number}/edit?version=${plan.version_number}`
                                          )
                                        }
                                      >
                                        Edit
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 text-xs"
                                        disabled={!slugifyClientName(plan.mp_client_name)}
                                        onClick={() => {
                                          const slug = slugifyClientName(plan.mp_client_name)
                                          if (!slug) return
                                          router.push(`/dashboard/${slug}/${plan.mba_number}`)
                                        }}
                                      >
                                        View
                                      </Button>
                                    </div>
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
        <div className="w-full max-w-none space-y-6 px-4 pb-12 pt-8 md:px-6">
          <p className="text-sm text-muted-foreground">Loading campaigns…</p>
        </div>
      }
    >
      <MediaPlansPageInner />
    </Suspense>
  )
}
