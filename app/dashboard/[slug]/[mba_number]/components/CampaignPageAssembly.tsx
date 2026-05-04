"use client"

import { Component, type ErrorInfo, type ReactNode, Suspense, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { format } from "date-fns"
import type { CampaignKPI } from "@/lib/kpi/types"
import { getCampaignKPIs } from "@/lib/api/kpi"
import { buildKPITargetsMap, type KPITargetsMap } from "@/lib/kpi/deliveryTargets"

import CampaignHeroBanner from "@/components/dashboard/campaign/CampaignHeroBanner"
import CampaignSummaryRow from "@/components/dashboard/campaign/CampaignSummaryRow"
import SpendChartsRow from "@/components/dashboard/campaign/SpendChartsRow"
import MediaPlanVizSection from "@/components/dashboard/campaign/MediaPlanVizSection"
import CampaignDetailsModal from "@/components/dashboard/campaign/CampaignDetailsModal"
import DeliverySection from "@/components/dashboard/delivery/DeliverySection"
import AdminDateRangeSelector from "./AdminDateRangeSelector"
import CampaignActions from "./CampaignActions"
import type { MediaPlanVersionListEntry } from "@/lib/api/dashboard"
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
import SocialDeliveryContainer from "@/components/dashboard/delivery/social/SocialDeliveryContainer"
import SearchDeliveryContainer from "@/components/dashboard/delivery/search/SearchDeliveryContainer"
import ProgrammaticDeliveryContainer from "@/components/dashboard/delivery/programmatic/ProgrammaticDeliveryContainer"

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
        <div className="rounded-2xl border border-rose-300/40 bg-rose-500/5 p-4 text-sm text-rose-700">
          <p className="font-medium">{this.props.title} failed to load.</p>
          <button
            type="button"
            className="mt-2 text-rose-700 underline underline-offset-2"
            onClick={() => this.setState({ hasError: false })}
          >
            Retry section
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

function CampaignHeroBannerSkeleton() {
  return <div className="h-40 w-full rounded-2xl skeleton-shimmer" />
}

function CampaignSummarySectionSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div className="h-32 rounded-2xl skeleton-shimmer" />
      <div className="h-32 rounded-2xl skeleton-shimmer" />
    </div>
  )
}

function SpendChartsRowSkeleton() {
  return <div className="h-[420px] w-full rounded-2xl skeleton-shimmer" />
}

function MediaPlanVizSectionSkeleton() {
  return <div className="h-[520px] w-full rounded-2xl skeleton-shimmer" />
}

function DeliverySectionSkeleton() {
  return <div className="h-[520px] w-full rounded-2xl skeleton-shimmer" />
}

type CampaignPageAssemblyProps = {
  slug: string
  mbaNumber: string
  campaign: any
  metrics: any
  budget: number
  actualSpend: number
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
  deliveryLineItemIds: string[]
  availableVersions: MediaPlanVersionListEntry[]
  currentVersion: number
}

function formatLocalYmd(d: Date): string {
  return format(d, "yyyy-MM-dd")
}

export default function CampaignPageAssembly(props: CampaignPageAssemblyProps) {
  const [detailsOpen, setDetailsOpen] = useState(false)
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

  const summaryMetrics = useMemo(() => {
    const deliverablesTotal = Number(metrics?.totalDeliverables ?? metrics?.deliverablesToDate ?? 0)
    const avgPacingPct = expectedSpend > 0 ? (actualSpend / expectedSpend) * 100 : 0
    return {
      totalSpend: actualSpend,
      totalDeliverables: deliverablesTotal,
      avgPacingPct: Number.isFinite(avgPacingPct) ? avgPacingPct : 0,
      lineItemCount: Object.values(lineItemsMap).reduce((sum, items) => sum + (Array.isArray(items) ? items.length : 0), 0),
    }
  }, [actualSpend, expectedSpend, lineItemsMap, metrics])

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

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6 rounded-none bg-surface-muted px-4 pb-24 md:space-y-8 md:rounded-3xl md:px-6 lg:px-8">
      <a
        href="#campaign-main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm"
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
            />
            <AdminDateRangeSelector
              campaignStart={campaignStartISO ?? startDate ?? undefined}
              campaignEnd={campaignEndISO ?? endDate ?? undefined}
              variant="inline"
              showPresets
            />
          </div>
        </Suspense>
      </SectionBoundary>

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
            </div>
          </Suspense>
        </SectionBoundary>
      </section>

      <section className="mt-8">
        <SectionBoundary title="Spend and delivery insights">
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
              <DeliverySection
                summary={summaryMetrics}
                lastUpdated={new Date()}
                onRefresh={() => window.location.reload()}
                brandColour={brandColour}
                platforms={["social", "search", "programmatic"]}
                platformSlots={{
                  social:
                    filteredSocialItems.length > 0 && startDate && endDate ? (
                      <SocialDeliveryContainer
                        clientSlug={slug}
                        mbaNumber={mbaNumber}
                        socialLineItems={filteredSocialItems}
                        campaignStart={startDate}
                        campaignEnd={endDate}
                        initialPacingRows={undefined}
                        deliveryLineItemIds={deliveryLineItemIds}
                        kpiTargets={kpiTargets}
                      />
                    ) : null,
                  search:
                    mpSearchEnabled && searchLineItemIds.length > 0 && startDate && endDate ? (
                      <SearchDeliveryContainer
                        clientSlug={slug}
                        mbaNumber={mbaNumber}
                        lineItemIds={searchLineItemIds}
                        searchLineItems={filteredSearchItems}
                        campaignStart={startDate}
                        campaignEnd={endDate}
                        kpiTargets={kpiTargets}
                      />
                    ) : null,
                  programmatic:
                    (filteredProgDisplay.length > 0 || filteredProgVideo.length > 0) &&
                    startDate &&
                    endDate ? (
                      <ProgrammaticDeliveryContainer
                        clientSlug={slug}
                        mbaNumber={mbaNumber}
                        progDisplayLineItems={filteredProgDisplay}
                        progVideoLineItems={filteredProgVideo}
                        campaignStart={startDate}
                        campaignEnd={endDate}
                        initialPacingRows={undefined}
                        deliveryLineItemIds={deliveryLineItemIds}
                        kpiTargets={kpiTargets}
                      />
                    ) : null,
                }}
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
