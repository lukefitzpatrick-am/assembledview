"use client"

import Link from "next/link"
import { Suspense, useCallback, useEffect, useMemo, useState } from "react"
import { PlusCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ViewStateBoundary } from "@/components/ui/ViewStateBoundary"
import { resolveListViewState } from "@/lib/ui/viewState"
import { AnimatePresence, motion, useReducedMotion, type Variants } from "framer-motion"

import { CampaignCardCompact } from "@/components/dashboard/CampaignCardCompact"
import { CampaignStatusPills, type CampaignStatus } from "@/components/dashboard/CampaignStatusPills"
import { ClientBrainCard } from "@/components/dashboard/ClientBrainCard"
import { HeroBanner } from "@/components/dashboard/HeroBanner"
import { HeroKPIBar } from "@/components/dashboard/HeroKPIBar"
import { SpendingInsightsSection } from "@/components/dashboard/SpendingInsightsSection"
import { UpcomingCampaignsSection } from "@/components/dashboard/UpcomingCampaignsSection"
import { ClientDetailsSlideOver } from "@/components/dashboard/modals/ClientDetailsSlideOver"
import { ClientFinanceSlideOver } from "@/components/dashboard/modals/ClientFinanceSlideOver"
import { ClientKpiSlideOver } from "@/components/dashboard/modals/ClientKpiSlideOver"
import { CampaignCardSkeleton, ChartSkeleton } from "@/components/dashboard/skeletons"
import { computePlannedSpendTotals } from "@/lib/dashboard/plannedSpendConsistency"
import { EMPTY_DELIVERED_TOTALS_WITH_AS_OF } from "@/lib/delivery/deliveredTotals"
import { formatDateShort } from "@/lib/format/date"
import type { Campaign as LegacyCampaign, ClientDashboardData as LegacyClientDashboardData } from "@/lib/types/dashboard"

/** Derive a freshness caption from Snowflake delivery `asOf` — never invent relative times. */
function formatDeliveryFreshness(asOf: string | undefined): string | null {
  if (!asOf?.trim()) return null
  const label = formatDateShort(`${asOf.trim()}T00:00:00`)
  if (label === "—") return null
  const short = label.replace(/\s+\d{4}$/, "")
  return `Delivery as of ${short}`
}

export type CampaignLinkMode = "tenant" | "adminHub"

export interface ClientDashboardPageContentProps {
  slug: string
  clientData: LegacyClientDashboardData
  campaignLinkMode?: CampaignLinkMode
  headerDescription?: string
}

/** `/api/dashboard/[slug]/delivered` response shape — see `getDeliveredTotalsForClient`. */
type DeliveredTotalsResponse = {
  spendToDate: number
  impressions: number
  hasDelivery: boolean
  asOf: string
}

type DashboardCampaign = {
  id: string
  name: string
  mbaNumber: string
  status: CampaignStatus | "paused"
  /**
   * Raw server campaign status (booked/approved/completed/draft/planning/...), distinct from
   * `status` above which is the UI bucket ("live"/"planned"/"completed"). Used to scope the
   * "Planned to date" / "Plan committed" KPI tiles to the same campaign set the server used
   * for `clientData.totalSpend` (see `lib/dashboard/plannedSpendConsistency.ts`).
   */
  rawStatus: LegacyCampaign["status"]
  mediaTypes: string[]
  /** Expected spend to date (plan) — same basis as campaign-page Expected Spend. */
  spentAmount: number | null
  totalBudget: number
  launchDate?: string
  href: string
  editHref?: string
  canEdit: boolean
}

function buildCampaignViewHref(slug: string, mbaNumber: string): string {
  return `/dashboard/${encodeURIComponent(slug)}/${encodeURIComponent(mbaNumber)}`
}

function buildCampaignEditHref(mbaNumber: string, versionNumber: number): string {
  return `/mediaplans/mba/${encodeURIComponent(mbaNumber)}/edit?version=${versionNumber}`
}

function toDashboardCampaign(
  slug: string,
  mode: CampaignLinkMode,
  campaign: LegacyCampaign,
  bucketStatus: CampaignStatus, // "live" | "planned" | "completed" — the server list this came from
): DashboardCampaign {
  // Card progress binds to expected spend to date (plan pace), NOT Snowflake delivered —
  // same word/basis as campaign-page "Expected Spend".
  const spentApprox =
    typeof campaign.expectedSpendToDate === "number" &&
    Number.isFinite(campaign.expectedSpendToDate) &&
    campaign.expectedSpendToDate > 0
      ? campaign.expectedSpendToDate
      : bucketStatus === "completed"
        ? campaign.budget
        : null
  const canEdit = mode === "adminHub"
  return {
    id: `${campaign.mbaNumber}-${campaign.version_number}`,
    name: campaign.campaignName,
    mbaNumber: campaign.mbaNumber,
    status: bucketStatus,
    rawStatus: campaign.status,
    mediaTypes: campaign.mediaTypes,
    spentAmount: spentApprox,
    totalBudget: campaign.budget,
    launchDate: campaign.startDate,
    href: buildCampaignViewHref(slug, campaign.mbaNumber),
    editHref: canEdit ? buildCampaignEditHref(campaign.mbaNumber, campaign.version_number) : undefined,
    canEdit,
  }
}

export function ClientDashboardPageContent({
  slug,
  clientData,
  campaignLinkMode = "tenant",
  headerDescription,
}: ClientDashboardPageContentProps) {
  const isAdmin = campaignLinkMode === "adminHub"
  const shouldReduceMotion = useReducedMotion()
  const [activeStatus, setActiveStatus] = useState<CampaignStatus>("live")
  const [detailsModalOpen, setDetailsModalOpen] = useState(false)
  const [financeModalOpen, setFinanceModalOpen] = useState(false)
  const [kpisModalOpen, setKpisModalOpen] = useState(false)
  const allCampaigns = useMemo(
    () =>
      [
        ...clientData.liveCampaignsList.map((c) => ({ c, bucket: "live" as CampaignStatus })),
        ...clientData.planningCampaignsList.map((c) => ({ c, bucket: "planned" as CampaignStatus })),
        ...clientData.completedCampaignsList.map((c) => ({ c, bucket: "completed" as CampaignStatus })),
      ].map(({ c, bucket }) => toDashboardCampaign(slug, campaignLinkMode, c, bucket)),
    [campaignLinkMode, clientData.completedCampaignsList, clientData.liveCampaignsList, clientData.planningCampaignsList, slug],
  )

  const statusCounts = useMemo(
    () =>
      allCampaigns.reduce(
        (acc, campaign) => {
          const key = campaign.status === "paused" ? "planned" : campaign.status
          acc[key] += 1
          return acc
        },
        { live: 0, planned: 0, completed: 0 }
      ),
    [allCampaigns]
  )

  const filteredCampaigns = useMemo(
    () => allCampaigns.filter((campaign) => (campaign.status === "paused" ? "planned" : campaign.status) === activeStatus),
    [activeStatus, allCampaigns]
  )

  const clearStatusFilter = useCallback(() => {
    const order: CampaignStatus[] = ["live", "planned", "completed"]
    const next = order.find((s) => statusCounts[s] > 0) ?? "live"
    setActiveStatus(next)
  }, [statusCounts])

  const campaignsViewState = useMemo(
    () =>
      resolveListViewState({
        loading: false,
        error: null,
        items: allCampaigns,
        visible: filteredCampaigns,
        // Status pill is a filter only when there is an underlying set; when the
        // client has zero campaigns, that is genuine empty (SSR — no list error path).
        filtersActive: false,
        clear: clearStatusFilter,
      }),
    [allCampaigns, filteredCampaigns, clearStatusFilter]
  )

  const upcomingCampaigns = useMemo(
    () =>
      allCampaigns
        .filter((campaign) => campaign.status === "planned")
        .sort((a, b) => new Date(a.launchDate || "").getTime() - new Date(b.launchDate || "").getTime()),
    [allCampaigns]
  )

  const totalBudget = useMemo(() => allCampaigns.reduce((sum, campaign) => sum + campaign.totalBudget, 0), [allCampaigns])
  const totalSpent = useMemo(
    () => allCampaigns.reduce((sum, campaign) => sum + (campaign.spentAmount ?? 0), 0),
    [allCampaigns]
  )

  /**
   * KPI-bar self-consistency (Task 2): "Planned to date" and "Plan committed" (UI label for
   * `budgetUtilizedPct`) must agree, so both are derived from the SAME booked/approved/completed
   * campaign set and the SAME planned-spend basis — see `lib/dashboard/plannedSpendConsistency.ts`.
   * Do NOT reintroduce `clientData.totalSpend` (a differently-windowed server figure) or the
   * unfiltered `totalBudget`/`totalSpent` above into either KPI tile.
   */
  const { plannedToDate, plannedBudget, budgetUtilizedPct } = useMemo(
    () => computePlannedSpendTotals(allCampaigns),
    [allCampaigns]
  )

  /**
   * "Delivered" KPI tile (Task 3) — fetched client-side from `/api/dashboard/[slug]/delivered`
   * so the (Snowflake-backed) read never blocks the SSR paint of the rest of the dashboard.
   * `undefined` = still loading (`deliveredLoading` below). A non-OK response or fetch failure
   * settles to `EMPTY_DELIVERED_TOTALS_WITH_AS_OF` (`hasDelivery: false`) — never a fabricated
   * $0-as-delivered figure, but also never left `undefined` forever, or the tile would spin
   * indefinitely whenever Snowflake is unavailable.
   */
  const [deliveredTotals, setDeliveredTotals] = useState<DeliveredTotalsResponse | undefined>(undefined)
  useEffect(() => {
    let cancelled = false
    setDeliveredTotals(undefined)
    fetch(`/api/dashboard/${encodeURIComponent(slug)}/delivered`)
      .then((res) => (res.ok ? (res.json() as Promise<DeliveredTotalsResponse>) : EMPTY_DELIVERED_TOTALS_WITH_AS_OF))
      .then((data) => {
        if (!cancelled) setDeliveredTotals(data)
      })
      .catch(() => {
        if (!cancelled) setDeliveredTotals(EMPTY_DELIVERED_TOTALS_WITH_AS_OF)
      })
    return () => {
      cancelled = true
    }
  }, [slug])

  const isClientHub = campaignLinkMode === "adminHub"
  const deliveryFreshness = formatDeliveryFreshness(deliveredTotals?.asOf)
  const { campaignsYtdCount, campaignsYtdCaption } = useMemo(() => {
    if (!isClientHub) {
      return { campaignsYtdCount: undefined, campaignsYtdCaption: undefined }
    }
    const currentYear = new Date().getFullYear()
    const dated = allCampaigns.filter((c) => {
      if (!c.launchDate) return false
      return !Number.isNaN(new Date(c.launchDate).getTime())
    })
    const inYear = dated.filter((c) => new Date(c.launchDate!).getFullYear() === currentYear)
    if (dated.length === 0) {
      return {
        campaignsYtdCount: allCampaigns.length,
        campaignsYtdCaption: "Across live, planned & completed",
      }
    }
    return {
      campaignsYtdCount: inYear.length,
      campaignsYtdCaption: `With start date in ${currentYear}`,
    }
  }, [allCampaigns, isClientHub])

  /** Fallback when API omits `finance` (`getClientDashboardData` does not populate it yet). No fabricated quarters/transactions. */
  const financeData = {
    totalBudget,
    ytdSpend: totalSpent,
    budgetByQuarter: [],
    spendByMediaType: clientData.spendByMediaType.map((m) => ({
      mediaType: m.mediaType,
      amount: m.amount,
      percentage: m.percentage,
    })),
    recentTransactions: [],
  }

  const loadingFallback = <ChartSkeleton />

  const containerVariants: Variants | undefined = shouldReduceMotion
    ? undefined
    : {
        hidden: { opacity: 0 },
        visible: {
          opacity: 1,
          transition: { staggerChildren: 0.1 },
        },
      }

  const sectionVariants: Variants | undefined = shouldReduceMotion
    ? undefined
    : {
        hidden: { opacity: 0, y: 20 },
        visible: {
          opacity: 1,
          y: 0,
          transition: { duration: 0.4, ease: "easeOut" },
        },
      }

  return (
    <div className="min-h-screen w-full bg-background">
      <motion.div
        initial={shouldReduceMotion ? undefined : "hidden"}
        animate={shouldReduceMotion ? undefined : "visible"}
        variants={containerVariants}
        className="mx-auto w-full max-w-[1800px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8 xl:px-12 2xl:px-16"
      >
        <motion.section variants={sectionVariants} className="w-full">
          {/* HeroBanner: averageRoas / performanceVsBenchmark omitted (fabricated); restore with real KPI aggregation (Domain 10). */}
          {/* totalSpend/spendLabel: "Planned to date" — same basis + campaign set as HeroKPIBar below (Task 2). */}
          <HeroBanner
            clientName={headerDescription ? `${clientData.clientName}` : clientData.clientName}
            clientLogo={clientData.clientLogo ?? undefined}
            brandColour={clientData.brandColour}
            totalSpend={plannedToDate}
            spendLabel="Planned to date"
            activeCampaigns={statusCounts.live}
            onOpenDetails={() => setDetailsModalOpen(true)}
            onOpenFinance={() => setFinanceModalOpen(true)}
            onOpenKPIs={() => setKpisModalOpen(true)}
            isAdmin={isAdmin}
            clientHubLayout={isClientHub}
            clientRecord={isClientHub ? clientData.clientRecord : null}
          />
        </motion.section>

        {isClientHub ? (
          <motion.section variants={sectionVariants} className="mt-6 w-full lg:mt-8">
            <ClientBrainCard
              clientName={clientData.clientName}
              record={clientData.clientRecord}
            />
          </motion.section>
        ) : null}

        <motion.section variants={sectionVariants} className="mt-6 w-full lg:mt-8">
          {/* HeroKPIBar: averageRoas / roasTrend omitted (fabricated); restore with real KPI aggregation (Domain 10). */}
          {/* totalSpend/totalBudget/budgetUtilized: same booked/approved/completed campaign set +
              planned-spend basis as HeroBanner's "Planned to date" above — see
              lib/dashboard/plannedSpendConsistency.ts. Do NOT swap in clientData.totalSpend or
              the unfiltered totalBudget/totalSpent (different bases — that was the Task 2 bug). */}
          <HeroKPIBar
            totalSpend={plannedToDate}
            totalBudget={plannedBudget}
            spendLabel="Planned to date"
            liveCampaigns={statusCounts.live}
            plannedCampaigns={statusCounts.planned}
            budgetUtilized={budgetUtilizedPct}
            campaignsYtd={isClientHub ? campaignsYtdCount : undefined}
            campaignsYtdCaption={isClientHub ? campaignsYtdCaption : undefined}
            deliveredLoading={deliveredTotals === undefined}
            deliveredToDate={deliveredTotals?.spendToDate}
            deliveredHasData={deliveredTotals?.hasDelivery ?? false}
            deliveredAsOf={deliveredTotals?.asOf}
          />
        </motion.section>

        <motion.section variants={sectionVariants} className="mt-8 w-full space-y-4 lg:mt-10 lg:space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-2.5 w-2.5 animate-pulse rounded-full bg-pacing-ahead" aria-hidden />
            <h2 className="text-lg font-semibold text-foreground">Live now</h2>
            <span className="rounded-full bg-pacing-ahead-bg px-2 py-0.5 text-xs font-medium text-status-ahead-fg">
              {statusCounts.live}
            </span>
            {deliveryFreshness ? (
              <span className="text-xs text-muted-foreground">{deliveryFreshness}</span>
            ) : null}
          </div>
          <Link
            href={`/dashboard/${encodeURIComponent(slug)}`}
            className="text-sm text-primary transition-transform hover:scale-[1.02] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            View all campaigns →
          </Link>
        </div>

        <CampaignStatusPills activeStatus={activeStatus} counts={statusCounts} onChange={setActiveStatus} />

        <ViewStateBoundary
          state={campaignsViewState}
          emptyTitle="No campaigns yet"
          emptyMessage="Create a media plan for this client to get started."
          emptyAction={
            <Button type="button" asChild>
              <Link href="/mediaplans/create">
                <PlusCircle className="mr-2 h-4 w-4" />
                Create Media Plan
              </Link>
            </Button>
          }
          filteredEmptyTitle="No campaigns in this status"
          filteredEmptyMessage="Clear filters to jump to a status that has campaigns."
        >
          {(campaigns) => (
          <motion.div
            layout
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5 xl:grid-cols-4 xl:gap-6"
          >
            <AnimatePresence initial={false} mode="popLayout">
            {campaigns.map((campaign) => (
              <motion.div
                key={campaign.id}
                layout
                initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
                animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
                exit={shouldReduceMotion ? undefined : { opacity: 0, y: -10 }}
                transition={shouldReduceMotion ? undefined : { duration: 0.25, ease: "easeOut" }}
              >
                <CampaignCardCompact
                  id={campaign.id}
                  name={campaign.name}
                  mbaNumber={campaign.mbaNumber}
                  status={campaign.status}
                  mediaTypes={campaign.mediaTypes}
                  spentAmount={campaign.spentAmount}
                  totalBudget={campaign.totalBudget}
                  href={campaign.href}
                  editHref={campaign.editHref}
                  canEdit={campaign.canEdit}
                  showInlineEditButton={!isClientHub}
                  viewMenuLabel={isClientHub ? "View campaign dashboard" : "View campaign"}
                  viewLinkAriaLabel={isClientHub ? `View campaign dashboard: ${campaign.name}` : undefined}
                  brandColour={clientData.brandColour}
                />
              </motion.div>
            ))}
            </AnimatePresence>
          </motion.div>
          )}
        </ViewStateBoundary>
        </motion.section>

        <motion.section variants={sectionVariants} className="mt-8 w-full lg:mt-10">
          <Suspense fallback={loadingFallback}>
            <SpendingInsightsSection
              monthlyData={clientData.monthlySpend}
              monthlySpendByCampaign={clientData.monthlySpendByCampaign}
              campaignData={clientData.spendByCampaign}
              mediaTypeData={clientData.spendByMediaType}
              brandColour={clientData.brandColour}
              availableFinancialYears={clientData.availableFinancialYears}
              selectedFinancialYear={clientData.selectedFinancialYear}
              slug={slug}
            />
          </Suspense>
        </motion.section>

        <motion.section variants={sectionVariants} className="mt-8 w-full lg:mt-10">
          <UpcomingCampaignsSection
            campaigns={upcomingCampaigns}
            maxItems={4}
            viewAllHref={`/dashboard/${encodeURIComponent(slug)}?status=planned`}
          />
        </motion.section>

      </motion.div>

      {isAdmin && (
        <>
          <ClientDetailsSlideOver
            open={detailsModalOpen}
            onOpenChange={setDetailsModalOpen}
            clientRecord={clientData.clientRecord ?? null}
            brandColour={clientData.brandColour}
          />

          <ClientFinanceSlideOver
            open={financeModalOpen}
            onOpenChange={setFinanceModalOpen}
            finance={clientData.finance ?? financeData}
            onDownloadReport={() => window.print()}
            variant={campaignLinkMode === "adminHub" ? "clientHub" : "default"}
            brandColour={clientData.brandColour}
            {...(campaignLinkMode === "adminHub"
              ? {
                  clientName: clientData.clientName,
                  clientRecord: clientData.clientRecord ?? null,
                }
              : {})}
          />

          <ClientKpiSlideOver
            open={kpisModalOpen}
            onOpenChange={setKpisModalOpen}
            urlSlug={slug}
            clientName={
              typeof clientData.clientRecord?.mp_client_name === "string" &&
              clientData.clientRecord.mp_client_name.trim()
                ? clientData.clientRecord.mp_client_name.trim()
                : slug
            }
            brandColour={clientData.brandColour}
          />
        </>
      )}
    </div>
  )
}
