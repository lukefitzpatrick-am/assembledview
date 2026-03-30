"use client"

import Link from "next/link"
import { Suspense, useMemo, useState } from "react"
import { AnimatePresence, motion, useReducedMotion, type Variants } from "framer-motion"

import { CampaignCardCompact } from "@/components/dashboard/CampaignCardCompact"
import { CampaignStatusPills, type CampaignStatus } from "@/components/dashboard/CampaignStatusPills"
import { HeroBanner } from "@/components/dashboard/HeroBanner"
import { HeroKPIBar } from "@/components/dashboard/HeroKPIBar"
import { SpendingInsightsSection } from "@/components/dashboard/SpendingInsightsSection"
import { UpcomingCampaignsSection } from "@/components/dashboard/UpcomingCampaignsSection"
import { ClientDetailsModal } from "@/components/dashboard/modals/ClientDetailsModal"
import { FinanceModal } from "@/components/dashboard/modals/FinanceModal"
import { KPIsModal } from "@/components/dashboard/modals/KPIsModal"
import { CampaignCardSkeleton, ChartSkeleton } from "@/components/dashboard/skeletons"
import type { Campaign as LegacyCampaign, ClientDashboardData as LegacyClientDashboardData } from "@/lib/types/dashboard"

export type CampaignLinkMode = "tenant" | "admin" | "adminHub"

export interface ClientDashboardPageContentProps {
  slug: string
  clientData: LegacyClientDashboardData
  campaignLinkMode?: CampaignLinkMode
  headerDescription?: string
}

type DashboardCampaign = {
  id: string
  name: string
  mbaNumber: string
  status: CampaignStatus | "paused"
  mediaTypes: string[]
  spentAmount: number
  totalBudget: number
  launchDate?: string
  href: string
  editHref?: string
  canEdit: boolean
}

function normalizeCampaignStatus(rawStatus?: string): CampaignStatus {
  const status = (rawStatus ?? "").toLowerCase()
  if (status === "completed") return "completed"
  if (status === "live" || status === "booked" || status === "approved") return "live"
  return "planned"
}

function buildCampaignViewHref(slug: string, mbaNumber: string): string {
  return `/dashboard/${encodeURIComponent(slug)}/${encodeURIComponent(mbaNumber)}`
}

function buildCampaignEditHref(mbaNumber: string, versionNumber: number): string {
  return `/mediaplans/mba/${encodeURIComponent(mbaNumber)}/edit?version=${versionNumber}`
}

function toDashboardCampaign(slug: string, mode: CampaignLinkMode, campaign: LegacyCampaign): DashboardCampaign {
  const spentApprox = normalizeCampaignStatus(campaign.status) === "completed" ? campaign.budget : campaign.budget * 0.72
  const canEdit = mode === "admin" || mode === "adminHub"
  return {
    id: `${campaign.mbaNumber}-${campaign.version_number}`,
    name: campaign.campaignName,
    mbaNumber: campaign.mbaNumber,
    status: normalizeCampaignStatus(campaign.status),
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
  const isAdmin = campaignLinkMode === "admin" || campaignLinkMode === "adminHub"
  const shouldReduceMotion = useReducedMotion()
  const [activeStatus, setActiveStatus] = useState<CampaignStatus>("live")
  const [detailsModalOpen, setDetailsModalOpen] = useState(false)
  const [financeModalOpen, setFinanceModalOpen] = useState(false)
  const [kpisModalOpen, setKpisModalOpen] = useState(false)
  const [spendingPeriod, setSpendingPeriod] = useState("month")

  const allCampaigns = useMemo(
    () =>
      [
        ...clientData.liveCampaignsList,
        ...clientData.planningCampaignsList,
        ...clientData.completedCampaignsList,
      ].map((campaign) => toDashboardCampaign(slug, campaignLinkMode, campaign)),
    [campaignLinkMode, clientData.completedCampaignsList, clientData.liveCampaignsList, clientData.planningCampaignsList, slug]
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

  const upcomingCampaigns = useMemo(
    () =>
      allCampaigns
        .filter((campaign) => campaign.status === "planned")
        .sort((a, b) => new Date(a.launchDate || "").getTime() - new Date(b.launchDate || "").getTime()),
    [allCampaigns]
  )

  const totalBudget = useMemo(() => allCampaigns.reduce((sum, campaign) => sum + campaign.totalBudget, 0), [allCampaigns])
  const totalSpent = useMemo(() => allCampaigns.reduce((sum, campaign) => sum + campaign.spentAmount, 0), [allCampaigns])

  const isClientHub = campaignLinkMode === "adminHub"
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

  const financeData = {
    totalBudget,
    ytdSpend: totalSpent,
    currency: "USD",
    budgetByQuarter: [
      { quarter: "Q1 2026", budget: totalBudget * 0.25, spent: totalSpent * 0.3, status: "complete" as const },
      { quarter: "Q2 2026", budget: totalBudget * 0.25, spent: totalSpent * 0.28, status: "in-progress" as const },
      { quarter: "Q3 2026", budget: totalBudget * 0.25, spent: totalSpent * 0.2, status: "planned" as const },
      { quarter: "Q4 2026", budget: totalBudget * 0.25, spent: totalSpent * 0.1, status: "planned" as const },
    ],
    spendByMediaType: clientData.spendByMediaType.map((m) => ({
      mediaType: m.mediaType,
      amount: m.amount,
      percentage: m.percentage,
    })),
    recentTransactions: allCampaigns.slice(0, 8).map((campaign, idx) => ({
      id: `${campaign.id}-txn`,
      description: `${campaign.name} media placement`,
      date: campaign.launchDate || new Date().toISOString(),
      amount: idx % 5 === 0 ? campaign.spentAmount * 0.04 : -campaign.spentAmount * 0.07,
      type: idx % 5 === 0 ? ("credit" as const) : ("expense" as const),
    })),
  }

  const kpiData = {
    overallPerformance: 12.4,
    metrics: {
      roas: { value: 3.2, trend: 8.2, benchmark: 2.9 },
      cpm: { value: 21.4, trend: -4.1, benchmark: 23.0 },
      ctr: { value: 1.9, trend: 3.4, benchmark: 1.7 },
      cpa: { value: 44.3, trend: -2.8, benchmark: 47.8 },
    },
    byChannel: clientData.spendByMediaType.slice(0, 6).map((item, index) => ({
      channel: item.mediaType,
      spend: item.amount,
      roas: Math.max(1, 2.2 + index * 0.2),
      performance: index % 3 === 0 ? ("below" as const) : index % 2 === 0 ? ("at" as const) : ("above" as const),
    })),
    byCampaign: allCampaigns.slice(0, 8).map((campaign, index) => ({
      id: campaign.id,
      name: campaign.name,
      roas: 2.1 + (index % 5) * 0.35,
      spend: campaign.spentAmount,
      performance: index % 3 === 0 ? ("below" as const) : index % 2 === 0 ? ("at" as const) : ("above" as const),
    })),
    monthlyTrend: clientData.monthlySpend.slice(-6).map((month, index) => ({
      month: month.month,
      roas: 2.2 + index * 0.12,
    })),
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
          <HeroBanner
            clientName={headerDescription ? `${clientData.clientName}` : clientData.clientName}
            clientLogo={clientData.clientLogo ?? undefined}
            brandColour={clientData.brandColour}
            totalSpend={clientData.totalSpend}
            activeCampaigns={statusCounts.live}
            averageRoas={kpiData.metrics.roas.value}
            performanceVsBenchmark={kpiData.overallPerformance}
            onOpenDetails={() => setDetailsModalOpen(true)}
            onOpenFinance={() => setFinanceModalOpen(true)}
            onOpenKPIs={() => setKpisModalOpen(true)}
            isAdmin={isAdmin}
            clientHubLayout={isClientHub}
          />
        </motion.section>

        <motion.section variants={sectionVariants} className="mt-6 w-full lg:mt-8">
          <HeroKPIBar
            totalSpend={clientData.totalSpend}
            totalBudget={totalBudget}
            liveCampaigns={statusCounts.live}
            plannedCampaigns={statusCounts.planned}
            averageRoas={kpiData.metrics.roas.value}
            roasTrend={kpiData.metrics.roas.trend}
            budgetUtilized={totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0}
            campaignsYtd={isClientHub ? campaignsYtdCount : undefined}
            campaignsYtdCaption={isClientHub ? campaignsYtdCaption : undefined}
          />
        </motion.section>

        <motion.section variants={sectionVariants} className="mt-8 w-full space-y-4 lg:mt-10 lg:space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-500" aria-hidden />
            <h2 className="text-lg font-semibold text-foreground">Live now</h2>
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-600">
              {statusCounts.live}
            </span>
            <span className="text-xs text-muted-foreground">Updated 2 min ago</span>
          </div>
          <Link
            href={`/dashboard/${encodeURIComponent(slug)}`}
            className="text-sm text-primary transition-transform hover:scale-[1.02] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            View all campaigns →
          </Link>
        </div>

        <CampaignStatusPills activeStatus={activeStatus} counts={statusCounts} onChange={setActiveStatus} />

        {filteredCampaigns.length > 0 ? (
          <motion.div
            layout
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5 xl:grid-cols-4 xl:gap-6"
          >
            <AnimatePresence initial={false} mode="popLayout">
            {filteredCampaigns.map((campaign) => (
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
                  brandColour={clientData.brandColour}
                />
              </motion.div>
            ))}
            </AnimatePresence>
          </motion.div>
        ) : (
          <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-4 py-10 text-center text-sm text-muted-foreground md:px-6 lg:px-8">
            No campaigns in this status right now.
          </div>
        )}
        </motion.section>

        <motion.section variants={sectionVariants} className="mt-8 w-full lg:mt-10">
          <Suspense fallback={loadingFallback}>
            <SpendingInsightsSection
              monthlyData={clientData.monthlySpend}
              campaignData={clientData.spendByCampaign}
              mediaTypeData={clientData.spendByMediaType}
              brandColour={clientData.brandColour}
              defaultPeriod="month"
              onPeriodChange={setSpendingPeriod}
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

        <motion.div variants={sectionVariants} className="mt-8 space-y-2 text-xs text-muted-foreground lg:mt-10">
          <p>
            Active chart period: <span className="font-medium text-foreground">{spendingPeriod}</span>
          </p>
        </motion.div>
      </motion.div>

      {isAdmin && (
        <>
          <ClientDetailsModal
            open={detailsModalOpen}
            onOpenChange={setDetailsModalOpen}
            clientRecord={clientData.clientRecord ?? null}
          />

          <FinanceModal
            open={financeModalOpen}
            onOpenChange={setFinanceModalOpen}
            finance={clientData.finance ?? financeData}
            onDownloadReport={() => window.print()}
            variant={campaignLinkMode === "adminHub" ? "clientHub" : "default"}
            {...(campaignLinkMode === "adminHub"
              ? {
                  clientName: clientData.clientName,
                  clientRecord: clientData.clientRecord ?? null,
                }
              : {})}
          />

          <KPIsModal
            open={kpisModalOpen}
            onOpenChange={setKpisModalOpen}
            urlSlug={slug}
            clientName={
              typeof clientData.clientRecord?.mp_client_name === "string" &&
              clientData.clientRecord.mp_client_name.trim()
                ? clientData.clientRecord.mp_client_name.trim()
                : slug
            }
          />
        </>
      )}
    </div>
  )
}
