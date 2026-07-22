"use client"

import {
  Component,
  type ErrorInfo,
  type ReactNode,
  Suspense,
  useEffect,
  useMemo,
  useState,
} from "react"
import { usePathname, useSearchParams } from "next/navigation"
import { format } from "date-fns"
import type { CampaignKPI } from "@/lib/kpi/types"
import { getCampaignKPIs } from "@/lib/api/kpi"
import { buildKPITargetsMap, type KPITargetsMap } from "@/lib/kpi/deliveryTargets"
import { buildLineItemKpiTargetMap } from "@/lib/kpi/lineItemKpiTargets"
import { clearAssistantContext, setAssistantContext } from "@/lib/assistantBridge"
import type { PageContext } from "@/lib/ava/types"

import { AvaPacingNudge } from "@/components/ava/AvaPacingNudge"
import CampaignHeroBanner from "@/components/dashboard/campaign/CampaignHeroBanner"
import CampaignSummaryRow from "@/components/dashboard/campaign/CampaignSummaryRow"
import SpendChartsRow from "@/components/dashboard/campaign/SpendChartsRow"
import MediaPlanVizSection from "@/components/dashboard/campaign/MediaPlanVizSection"
import CampaignDetailsModal from "@/components/dashboard/campaign/CampaignDetailsModal"
import { PlannedAudienceSection } from "@/components/dashboard/campaign/PlannedAudienceSection"
import { CampaignDeliverySection } from "@/components/dashboard/delivery/CampaignDeliverySection"
import CampaignActions from "./CampaignActions"
import type { MediaPlanVersionListEntry } from "@/lib/api/dashboard"
import { ErrorState, LoadingState } from "@/components/ui/states"
import {
  aggregateSpendByChannelFromMonthly,
  burstOverlapsRange,
  filterDeliverySchedule,
  filterLineItemsByBursts,
  filterMonthlySpendByRange,
  isFullCampaign,
  parseDateOnly,
  recomputeTimeMetrics,
  type DateRange,
} from "@/lib/dashboard/dateFilter"

const CHANNEL_SNAPSHOT_CAP = 15

function roundPct(n: number): number {
  return Math.round(n * 10) / 10
}

function channelLinesFromSpend(spendByChannel: unknown): Array<{
  name: string
  channel: string
  planned: number
}> {
  const lines: Array<{ name: string; channel: string; planned: number }> = []
  if (Array.isArray(spendByChannel)) {
    for (const entry of spendByChannel) {
      if (!entry || typeof entry !== "object") continue
      const name = String(
        (entry as any).mediaType ??
          (entry as any).channel ??
          (entry as any).media_type ??
          (entry as any).name ??
          "",
      ).trim()
      if (!name) continue
      const planned = Number((entry as any).amount ?? (entry as any).spend ?? 0)
      lines.push({
        name,
        channel: name,
        planned: Number.isFinite(planned) ? planned : 0,
      })
      if (lines.length >= CHANNEL_SNAPSHOT_CAP) break
    }
    return lines
  }
  if (spendByChannel && typeof spendByChannel === "object") {
    for (const [name, amount] of Object.entries(spendByChannel as Record<string, unknown>)) {
      const planned = Number(amount)
      lines.push({
        name,
        channel: name,
        planned: Number.isFinite(planned) ? planned : 0,
      })
      if (lines.length >= CHANNEL_SNAPSHOT_CAP) break
    }
  }
  return lines
}

function kpiTargetsSnapshot(rows: CampaignKPI[]): Record<string, number | null> | undefined {
  if (!rows.length) return undefined
  let ctr: number | null = null
  let cvr: number | null = null
  let vtr: number | null = null
  let frequency: number | null = null
  for (const row of rows) {
    if (ctr == null && row.ctr != null && Number.isFinite(Number(row.ctr))) ctr = Number(row.ctr)
    if (cvr == null && row.conversion_rate != null && Number.isFinite(Number(row.conversion_rate))) {
      cvr = Number(row.conversion_rate)
    }
    if (vtr == null && row.vtr != null && Number.isFinite(Number(row.vtr))) vtr = Number(row.vtr)
    if (frequency == null && row.frequency != null && Number.isFinite(Number(row.frequency))) {
      frequency = Number(row.frequency)
    }
  }
  const out: Record<string, number | null> = {}
  if (ctr != null) out.ctrTarget = ctr
  if (cvr != null) out.cvrTarget = cvr
  if (vtr != null) out.vtrTarget = vtr
  if (frequency != null) out.frequencyTarget = frequency
  return Object.keys(out).length ? out : undefined
}
type SectionBoundaryProps = {
  title: string
  children: ReactNode
}

type SectionBoundaryState = {
  hasError: boolean
}

class SectionBoundary extends Component<SectionBoundaryProps, SectionBoundaryState> {
  state: SectionBoundaryState = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {}

  render() {
    if (this.state.hasError) {
      return (
        <ErrorState
          title={`${this.props.title} failed to load.`}
          message="Retry this section or refresh the campaign if the problem continues."
          onRetry={() => this.setState({ hasError: false })}
          retryLabel="Retry section"
        />
      )
    }
    return this.props.children
  }
}

function CampaignHeroBannerSkeleton() {
  return <LoadingState rows={3} className="min-h-40" />
}

function CampaignSummarySectionSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <LoadingState rows={3} className="min-h-32" />
      <LoadingState rows={3} className="min-h-32" />
    </div>
  )
}

function SpendChartsRowSkeleton() {
  return <LoadingState rows={5} className="min-h-[420px]" />
}

function MediaPlanVizSectionSkeleton() {
  return <LoadingState rows={6} className="min-h-[520px]" />
}

function DeliverySectionSkeleton() {
  return <LoadingState rows={6} className="min-h-[520px]" />
}

type CampaignPageAssemblyProps = {
  slug: string
  mbaNumber: string
  campaign: any
  metrics: any
  budget: number
  /** Real delivered spend only when the API provides it — never plan schedule. */
  actualSpend?: number
  expectedSpend: number
  totalPlannedMonthlySpend: number
  startDate?: string | null
  endDate?: string | null
  campaignStartISO?: string | null
  campaignEndISO?: string | null
  brandColour?: string
  deliverySchedule: any[]
  spendByChannel: any
  monthlySpend: any
  lineItemsMap: Record<string, any[]>
  billingSchedule: any
  xanoFileOrigin: string
  mediaPlanFileMeta: any
  mbaPdfFileMeta: any
  showDeliverySection: boolean
  socialItemsActive: any[]
  searchItemsActive: any[]
  searchLineItemIds: string[]
  mpSearchEnabled: boolean
  progDisplayItemsActive: any[]
  progVideoItemsActive: any[]
  adServingItemsActive: any[]
  deliveryLineItemIds: string[]
  availableVersions: MediaPlanVersionListEntry[]
  currentVersion: number
}

function formatLocalYmd(d: Date): string {
  return format(d, "yyyy-MM-dd")
}

export default function CampaignPageAssembly(props: CampaignPageAssemblyProps) {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const {
    slug,
    mbaNumber,
    campaign,
    metrics,
    budget,
    actualSpend,
    expectedSpend,
    totalPlannedMonthlySpend,
    startDate,
    endDate,
    campaignStartISO,
    campaignEndISO,
    brandColour,
    deliverySchedule,
    spendByChannel,
    monthlySpend,
    lineItemsMap,
    billingSchedule,
    xanoFileOrigin,
    mediaPlanFileMeta,
    mbaPdfFileMeta,
    showDeliverySection,
    socialItemsActive,
    searchItemsActive,
    searchLineItemIds,
    mpSearchEnabled,
    progDisplayItemsActive,
    progVideoItemsActive,
    adServingItemsActive,
    deliveryLineItemIds,
    availableVersions,
    currentVersion,
  } = props

  const filterRange: DateRange = useMemo(
    () => ({
      start: parseDateOnly(searchParams?.get("startDate")),
      end: parseDateOnly(searchParams?.get("endDate")),
    }),
    [searchParams],
  )

  const campaignBounds = useMemo(
    () => ({
      start: parseDateOnly(campaignStartISO ?? startDate ?? null),
      end: parseDateOnly(campaignEndISO ?? endDate ?? null),
    }),
    [campaignStartISO, campaignEndISO, startDate, endDate],
  )

  const isUnfiltered = isFullCampaign(filterRange, campaignBounds)

  const filteredMonthlySpend = useMemo(() => {
    if (isUnfiltered) return monthlySpend
    return filterMonthlySpendByRange(monthlySpend, filterRange)
  }, [filterRange, isUnfiltered, monthlySpend])

  const filteredSpendByChannel = useMemo(() => {
    if (isUnfiltered) return spendByChannel
    const totals = aggregateSpendByChannelFromMonthly(filteredMonthlySpend)
    if (Array.isArray(spendByChannel)) {
      return Object.entries(totals).map(([mediaType, amount]) => ({ mediaType, amount }))
    }
    return totals
  }, [filteredMonthlySpend, isUnfiltered, spendByChannel])

  const filteredDeliverySchedule = useMemo((): any[] => {
    if (isUnfiltered) return deliverySchedule
    return filterDeliverySchedule(deliverySchedule, filterRange) as any[]
  }, [deliverySchedule, filterRange, isUnfiltered])

  const filteredLineItemsMap = useMemo(() => {
    if (isUnfiltered) return lineItemsMap
    return filterLineItemsByBursts(lineItemsMap, filterRange) as Record<string, any[]>
  }, [filterRange, isUnfiltered, lineItemsMap])

  const filteredTimeMetrics = useMemo(() => {
    if (isUnfiltered) {
      return {
        timeElapsedPct: Number(metrics?.timeElapsed ?? 0),
        daysInCampaign: Number(metrics?.daysInCampaign ?? 0),
        daysElapsed: Number(metrics?.daysElapsed ?? 0),
        daysRemaining: Number(metrics?.daysRemaining ?? 0),
      }
    }
    return recomputeTimeMetrics(filterRange, campaignBounds)
  }, [campaignBounds, filterRange, isUnfiltered, metrics])

  const displayWindowStart = filterRange.start ?? campaignBounds.start
  const displayWindowEnd = filterRange.end ?? campaignBounds.end
  const progressStartYmd = displayWindowStart ? formatLocalYmd(displayWindowStart) : (startDate ?? "")
  const progressEndYmd = displayWindowEnd ? formatLocalYmd(displayWindowEnd) : (endDate ?? "")

  const filteredSocialItems = useMemo(() => {
    if (isUnfiltered) return socialItemsActive
    return socialItemsActive.filter((item) => {
      const bursts = Array.isArray(item?.bursts) ? item.bursts : []
      if (bursts.length === 0) return true
      return bursts.some((b: unknown) => burstOverlapsRange(b, filterRange))
    })
  }, [filterRange, isUnfiltered, socialItemsActive])

  const filteredSearchItems = useMemo(() => {
    if (isUnfiltered) return searchItemsActive
    return searchItemsActive.filter((item) => {
      const bursts = Array.isArray(item?.bursts) ? item.bursts : []
      if (bursts.length === 0) return true
      return bursts.some((b: unknown) => burstOverlapsRange(b, filterRange))
    })
  }, [filterRange, isUnfiltered, searchItemsActive])

  const filteredProgDisplay = useMemo(() => {
    if (isUnfiltered) return progDisplayItemsActive
    return progDisplayItemsActive.filter((item) => {
      const bursts = Array.isArray(item?.bursts) ? item.bursts : []
      if (bursts.length === 0) return true
      return bursts.some((b: unknown) => burstOverlapsRange(b, filterRange))
    })
  }, [filterRange, isUnfiltered, progDisplayItemsActive])

  const filteredProgVideo = useMemo(() => {
    if (isUnfiltered) return progVideoItemsActive
    return progVideoItemsActive.filter((item) => {
      const bursts = Array.isArray(item?.bursts) ? item.bursts : []
      if (bursts.length === 0) return true
      return bursts.some((b: unknown) => burstOverlapsRange(b, filterRange))
    })
  }, [filterRange, isUnfiltered, progVideoItemsActive])

  const filteredAdServing = useMemo(() => {
    if (isUnfiltered) return adServingItemsActive
    return adServingItemsActive.filter((item) => {
      const bursts = Array.isArray(item?.bursts) ? item.bursts : []
      if (bursts.length === 0) return true
      return bursts.some((b: unknown) => burstOverlapsRange(b, filterRange))
    })
  }, [filterRange, isUnfiltered, adServingItemsActive])

  // --- KPI targets for delivery containers (Stage 3b) ---
  const [savedCampaignKPIs, setSavedCampaignKPIs] = useState<CampaignKPI[]>([])
  const kpiVersionNumber: number = (() => {
    const raw =
      (campaign?.version_number as number | string | undefined) ??
      (campaign?.mp_plannumber as number | string | undefined) ??
      (campaign?.versionNumber as number | string | undefined)
    const n = typeof raw === "number" ? raw : Number(raw)
    return Number.isFinite(n) && n > 0 ? n : 1
  })()

  useEffect(() => {
    let cancelled = false
    if (!mbaNumber) return
    getCampaignKPIs(mbaNumber, kpiVersionNumber)
      .then((data) => {
        if (!cancelled) setSavedCampaignKPIs(data)
      })
      .catch((err) => {
        if (!cancelled) {
          console.error("[Delivery KPIs] failed to load saved campaign KPIs:", err)
          setSavedCampaignKPIs([])
        }
      })
    return () => {
      cancelled = true
    }
  }, [mbaNumber, kpiVersionNumber])

  const kpiTargets: KPITargetsMap = buildKPITargetsMap(savedCampaignKPIs)
  const lineItemTargets = useMemo(
    () => buildLineItemKpiTargetMap(savedCampaignKPIs),
    [savedCampaignKPIs],
  )

  const heroCampaign = useMemo(
    () => ({
      campaignName:
        campaign?.campaign_name ||
        campaign?.mp_campaignname ||
        campaign?.campaignName ||
        campaign?.name ||
        "Campaign",
      clientName:
        campaign?.client?.name ||
        campaign?.client_name ||
        campaign?.mp_client_name ||
        campaign?.clientName ||
        "Client",
      brand: campaign?.campaign_brand || campaign?.brand || campaign?.mp_brand || undefined,
      mbaNumber: campaign?.mba_number || campaign?.mp_mba_number || mbaNumber,
      status: campaign?.campaign_status || campaign?.status || "Draft",
      startDate: isUnfiltered ? startDate || "" : progressStartYmd,
      endDate: isUnfiltered ? endDate || "" : progressEndYmd,
      budget,
      planVersion:
        campaign?.versionNumber ||
        campaign?.version_number ||
        campaign?.media_plan_version ||
        campaign?.mp_plannumber,
      planDate: campaign?.plan_date || campaign?.created_at || campaign?.updated_at,
      poNumber: campaign?.po_number || campaign?.poNumber,
      clientContact: campaign?.client_contact || campaign?.contact_name || campaign?.contactName,
      expectedSpend,
      actualSpend,
      timeElapsedPct: filteredTimeMetrics.timeElapsedPct,
      daysInCampaign: filteredTimeMetrics.daysInCampaign,
      daysElapsed: filteredTimeMetrics.daysElapsed,
      daysRemaining: filteredTimeMetrics.daysRemaining,
    }),
    [
      actualSpend,
      budget,
      campaign,
      endDate,
      expectedSpend,
      filteredTimeMetrics,
      isUnfiltered,
      mbaNumber,
      progressEndYmd,
      progressStartYmd,
      startDate,
    ],
  )

  // Same definition as hero KPIs / assistant pageContext — do not introduce a second pace.
  const pacePct =
    typeof expectedSpend === "number" &&
    Number.isFinite(expectedSpend) &&
    expectedSpend > 0 &&
    typeof actualSpend === "number" &&
    Number.isFinite(actualSpend)
      ? roundPct((actualSpend / expectedSpend) * 100)
      : undefined

  const pageContext: PageContext | undefined = useMemo(() => {
    if (!slug || !mbaNumber || !campaign) return undefined

    const clientSlug = slug
    const clientName = heroCampaign.clientName
    const campaignName = heroCampaign.campaignName

    const channels = channelLinesFromSpend(filteredSpendByChannel)
    const kpis = kpiTargetsSnapshot(savedCampaignKPIs)

    const state: Record<string, unknown> = {
      surface: "campaign-dashboard",
      version: currentVersion,
      flightDates: {
        start: campaignStartISO ?? startDate ?? null,
        end: campaignEndISO ?? endDate ?? null,
      },
      spend: {
        // Only set when real delivery is known — do not mirror plan as delivered.
        ...(typeof actualSpend === "number" && Number.isFinite(actualSpend)
          ? { delivered: actualSpend }
          : {}),
        plannedToDate: Number.isFinite(expectedSpend) ? expectedSpend : undefined,
        ...(pacePct !== undefined ? { pacePct } : {}),
      },
      time: {
        elapsedPct: filteredTimeMetrics.timeElapsedPct,
        daysElapsed: filteredTimeMetrics.daysElapsed,
        daysRemaining: filteredTimeMetrics.daysRemaining,
      },
    }

    if (!isUnfiltered) {
      state.selectedDateRange = {
        start: progressStartYmd || null,
        end: progressEndYmd || null,
      }
    }

    if (kpis) state.kpis = kpis
    if (channels.length) state.channels = channels

    return {
      route: {
        pathname: pathname || `/dashboard/${clientSlug}/${mbaNumber}`,
        clientSlug,
        mbaSlug: mbaNumber,
      },
      entities: {
        clientSlug,
        clientName,
        mbaNumber,
        campaignName,
        versionNumber: currentVersion,
      },
      generatedAt: new Date().toISOString(),
      state,
    }
  }, [
    actualSpend,
    campaign,
    campaignEndISO,
    campaignStartISO,
    currentVersion,
    endDate,
    expectedSpend,
    filteredSpendByChannel,
    filteredTimeMetrics.daysElapsed,
    filteredTimeMetrics.daysRemaining,
    filteredTimeMetrics.timeElapsedPct,
    heroCampaign.campaignName,
    heroCampaign.clientName,
    isUnfiltered,
    mbaNumber,
    pacePct,
    pathname,
    progressEndYmd,
    progressStartYmd,
    savedCampaignKPIs,
    slug,
    startDate,
  ])

  useEffect(() => {
    if (!pageContext) return
    setAssistantContext({ pageContext })
  }, [pageContext])

  useEffect(() => {
    return () => {
      clearAssistantContext()
    }
  }, [])

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6 rounded-none bg-surface-muted px-4 pb-24 max-[375px]:pb-32 md:space-y-8 md:rounded-3xl md:px-6 lg:px-8">
      <a
        href="#campaign-main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-input focus:bg-background focus:px-3 focus:py-2 focus:text-sm"
      >
        Skip to campaign content
      </a>
      <div id="campaign-main-content" className="space-y-6 md:space-y-8">
      <SectionBoundary title="Campaign hero">
        <Suspense fallback={<CampaignHeroBannerSkeleton />}>
          <div className="campaign-section-enter space-y-3" style={{ animationDelay: "0ms" }}>
            <CampaignHeroBanner
              campaign={heroCampaign}
              brandColour={brandColour}
              daysRemaining={heroCampaign.daysRemaining}
              onOpenDetails={() => setDetailsOpen(true)}
              onDownload={() => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" })}
              campaignStart={campaignStartISO ?? startDate ?? undefined}
              campaignEnd={campaignEndISO ?? endDate ?? undefined}
            />
          </div>
        </Suspense>
      </SectionBoundary>

      <section className="mt-6">
        <SectionBoundary title="Planned audience">
          <div className="campaign-section-enter" style={{ animationDelay: "50ms" }}>
            <PlannedAudienceSection mbaNumber={mbaNumber} />
          </div>
        </SectionBoundary>
      </section>

      <section className="mt-6">
        <SectionBoundary title="Progress summary">
          <Suspense fallback={<CampaignSummarySectionSkeleton />}>
            <div className="campaign-section-enter" style={{ animationDelay: "100ms" }}>
            <CampaignSummaryRow
              time={{
                timeElapsedPct: filteredTimeMetrics.timeElapsedPct,
                daysInCampaign: filteredTimeMetrics.daysInCampaign,
                daysElapsed: filteredTimeMetrics.daysElapsed,
                daysRemaining: filteredTimeMetrics.daysRemaining,
                startDate: progressStartYmd,
                endDate: progressEndYmd,
              }}
              spend={{
                budget,
                actualSpend,
                expectedSpend,
                totalPlannedSpend: totalPlannedMonthlySpend,
              }}
              brandColour={brandColour}
            />
            {pacePct !== undefined ? (
              <AvaPacingNudge pacePct={pacePct} className="mt-3" />
            ) : null}
            </div>
          </Suspense>
        </SectionBoundary>
      </section>

      <section className="mt-8">
        <SectionBoundary title="Planned media insights">
          <Suspense fallback={<SpendChartsRowSkeleton />}>
            <div className="campaign-section-enter" style={{ animationDelay: "200ms" }}>
            <SpendChartsRow
              spendByChannel={filteredSpendByChannel}
              monthlySpendByChannel={filteredMonthlySpend}
              deliverySchedule={filteredDeliverySchedule}
              brandColour={brandColour}
              lineItemsMap={filteredLineItemsMap}
              campaignSpendToDate={expectedSpend}
            />
            </div>
          </Suspense>
        </SectionBoundary>
      </section>

      <section className="mt-8">
        <SectionBoundary title="Media plan">
          <Suspense fallback={<MediaPlanVizSectionSkeleton />}>
            <div className="campaign-section-enter" style={{ animationDelay: "300ms" }}>
            <MediaPlanVizSection
              lineItems={filteredLineItemsMap}
              campaignStart={startDate ?? undefined}
              campaignEnd={endDate ?? undefined}
              clientSlug={slug}
              mbaNumber={mbaNumber}
              defaultView="timeline"
            />
            </div>
          </Suspense>
        </SectionBoundary>
      </section>

      {showDeliverySection ? (
        <section className="mt-8">
          <SectionBoundary title="Delivery">
            <Suspense fallback={<DeliverySectionSkeleton />}>
              <div className="campaign-section-enter" style={{ animationDelay: "400ms" }}>
              <CampaignDeliverySection
                mbaNumber={mbaNumber}
                deliveryLineItemIds={deliveryLineItemIds}
                filterRange={filterRange}
                brandColour={brandColour}
                kpiTargets={kpiTargets}
                kpiVersionNumber={kpiVersionNumber}
                lineItemTargets={lineItemTargets}
                campaignStart={startDate ?? ""}
                campaignEnd={endDate ?? ""}
                socialLineItems={filteredSocialItems}
                searchLineItemIds={searchLineItemIds}
                searchLineItems={filteredSearchItems}
                mpSearchEnabled={mpSearchEnabled}
                progDisplayLineItems={filteredProgDisplay}
                progVideoLineItems={filteredProgVideo}
                adServingLineItems={filteredAdServing}
              />
              </div>
            </Suspense>
          </SectionBoundary>
        </section>
      ) : null}

      <CampaignDetailsModal
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        campaign={heroCampaign}
        spendByChannel={
          Array.isArray(filteredSpendByChannel)
            ? Object.fromEntries(
                filteredSpendByChannel.map((d: any) => [d.mediaType ?? d.channel, Number(d.amount ?? d.spend ?? 0)]),
              )
            : filteredSpendByChannel
        }
        lineItemCounts={Object.fromEntries(
          Object.entries(filteredLineItemsMap).map(([k, v]) => [k, Array.isArray(v) ? v.length : 0]),
        )}
      />

      <Suspense fallback={null}>
        <CampaignActions
          variant="floating"
          mbaNumber={mbaNumber}
          campaign={campaign}
          lineItems={lineItemsMap}
          billingSchedule={billingSchedule}
          xanoFileOrigin={xanoFileOrigin}
          mediaPlanFileMeta={mediaPlanFileMeta}
          mbaPdfFileMeta={mbaPdfFileMeta}
          availableVersions={availableVersions}
          currentVersion={currentVersion}
        />
      </Suspense>
      </div>
    </div>
  )
}
