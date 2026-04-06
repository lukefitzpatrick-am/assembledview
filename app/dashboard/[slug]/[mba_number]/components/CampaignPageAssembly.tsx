"use client"

import { Component, type ErrorInfo, type ReactNode, Suspense, useMemo, useState } from "react"

import CampaignHeroBanner from "@/components/dashboard/campaign/CampaignHeroBanner"
import CampaignSummaryRow from "@/components/dashboard/campaign/CampaignSummaryRow"
import SpendChartsRow from "@/components/dashboard/campaign/SpendChartsRow"
import MediaPlanVizSection from "@/components/dashboard/campaign/MediaPlanVizSection"
import CampaignDetailsModal from "@/components/dashboard/campaign/CampaignDetailsModal"
import PacingSection from "@/components/dashboard/pacing/PacingSection"
import AdminDateRangeSelector from "./AdminDateRangeSelector"
import CampaignActions from "./CampaignActions"
import SocialPacingContainer from "@/components/dashboard/pacing/social/SocialPacingContainer"
import SearchPacingContainer from "@/components/dashboard/pacing/search/SearchPacingContainer"
import ProgrammaticPacingContainer from "@/components/dashboard/pacing/programmatic/ProgrammaticPacingContainer"

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

function PacingSectionSkeleton() {
  return <div className="h-[520px] w-full rounded-2xl skeleton-shimmer" />
}

type CampaignPageAssemblyProps = {
  isAdmin: boolean
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
  showPacingSection: boolean
  socialItemsActive: any[]
  searchItemsActive: any[]
  searchLineItemIds: string[]
  mpSearchEnabled: boolean
  effectiveSearchStartISO?: string | null
  searchEndISO?: string | null
  progDisplayItemsActive: any[]
  progVideoItemsActive: any[]
  pacingLineItemIds: string[]
}

export default function CampaignPageAssembly(props: CampaignPageAssemblyProps) {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const {
    isAdmin,
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
    showPacingSection,
    socialItemsActive,
    searchItemsActive,
    searchLineItemIds,
    mpSearchEnabled,
    effectiveSearchStartISO,
    searchEndISO,
    progDisplayItemsActive,
    progVideoItemsActive,
    pacingLineItemIds,
  } = props

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
      startDate: startDate || "",
      endDate: endDate || "",
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
      timeElapsedPct: Number(metrics?.timeElapsed ?? 0),
      daysInCampaign: Number(metrics?.daysInCampaign ?? 0),
      daysElapsed: Number(metrics?.daysElapsed ?? 0),
      daysRemaining: Number(metrics?.daysRemaining ?? 0),
    }),
    [actualSpend, budget, campaign, endDate, expectedSpend, mbaNumber, metrics, startDate]
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
            {isAdmin ? (
              <AdminDateRangeSelector
                campaignStart={campaignStartISO ?? startDate ?? undefined}
                campaignEnd={campaignEndISO ?? endDate ?? undefined}
                variant="inline"
                showPresets
              />
            ) : null}
            <CampaignHeroBanner
              campaign={heroCampaign}
              brandColour={brandColour}
              timeElapsedPct={heroCampaign.timeElapsedPct}
              daysRemaining={heroCampaign.daysRemaining}
              onOpenDetails={() => setDetailsOpen(true)}
              onDownload={() => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" })}
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
                timeElapsedPct: Number(metrics?.timeElapsed ?? 0),
                daysInCampaign: Number(metrics?.daysInCampaign ?? 0),
                daysElapsed: Number(metrics?.daysElapsed ?? 0),
                daysRemaining: Number(metrics?.daysRemaining ?? 0),
                startDate: startDate || "",
                endDate: endDate || "",
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
              spendByChannel={spendByChannel}
              monthlySpendByChannel={monthlySpend}
              deliverySchedule={deliverySchedule}
              brandColour={brandColour}
              lineItemsMap={lineItemsMap}
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
              lineItems={lineItemsMap}
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

      {showPacingSection ? (
        <section className="mt-8">
          <SectionBoundary title="Live pacing">
            <Suspense fallback={<PacingSectionSkeleton />}>
              <div className="campaign-section-enter" style={{ animationDelay: "400ms" }}>
              <PacingSection
                summary={summaryMetrics}
                lastUpdated={new Date()}
                onRefresh={() => window.location.reload()}
                brandColour={brandColour}
                platforms={["social", "search", "programmatic"]}
                platformSlots={{
                  social:
                    socialItemsActive.length > 0 ? (
                      <SocialPacingContainer
                        clientSlug={slug}
                        mbaNumber={mbaNumber}
                        socialLineItems={socialItemsActive}
                        campaignStart={startDate ?? undefined}
                        campaignEnd={endDate ?? undefined}
                        initialPacingRows={undefined}
                        pacingLineItemIds={pacingLineItemIds}
                      />
                    ) : null,
                  search:
                    mpSearchEnabled && searchLineItemIds.length > 0 && effectiveSearchStartISO && searchEndISO ? (
                      <SearchPacingContainer
                        clientSlug={slug}
                        mbaNumber={mbaNumber}
                        lineItemIds={searchLineItemIds}
                        searchLineItems={searchItemsActive}
                        campaignPlannedEndDate={endDate ?? undefined}
                        startDate={effectiveSearchStartISO}
                        endDate={searchEndISO}
                      />
                    ) : null,
                  programmatic:
                    progDisplayItemsActive.length > 0 || progVideoItemsActive.length > 0 ? (
                      <ProgrammaticPacingContainer
                        clientSlug={slug}
                        mbaNumber={mbaNumber}
                        progDisplayLineItems={progDisplayItemsActive}
                        progVideoLineItems={progVideoItemsActive}
                        campaignStart={startDate ?? undefined}
                        campaignEnd={endDate ?? undefined}
                        initialPacingRows={undefined}
                        pacingLineItemIds={pacingLineItemIds}
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
        spendByChannel={Array.isArray(spendByChannel) ? Object.fromEntries(spendByChannel.map((d: any) => [d.mediaType ?? d.channel, Number(d.amount ?? d.spend ?? 0)])) : spendByChannel}
        lineItemCounts={Object.fromEntries(Object.entries(lineItemsMap).map(([k, v]) => [k, Array.isArray(v) ? v.length : 0]))}
      />

      <CampaignActions
        variant="floating"
        mbaNumber={mbaNumber}
        campaign={campaign}
        lineItems={lineItemsMap}
        billingSchedule={billingSchedule}
        xanoFileOrigin={xanoFileOrigin}
        mediaPlanFileMeta={mediaPlanFileMeta}
        mbaPdfFileMeta={mbaPdfFileMeta}
      />
      </div>
    </div>
  )
}
