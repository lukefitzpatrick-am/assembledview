"use client"

import Link from "next/link"
import { AnimatePresence, motion } from "framer-motion"
import { Activity, CheckCircle2, CalendarClock } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import type { ReactNode } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

import { CampaignCardCompact } from "@/components/dashboard/CampaignCardCompact"
import { CampaignStatusPills, type CampaignStatus } from "@/components/dashboard/CampaignStatusPills"
import { cn } from "@/lib/utils"

export interface Campaign {
  id: string
  name: string
  mbaNumber: string
  status: "live" | "planned" | "completed" | "paused" | "booked" | "approved" | string
  mediaTypes: string[]
  spentAmount: number | null
  totalBudget: number
  /** Optional override for campaign dashboard URL; defaults to `/dashboard/{slug}/{mbaNumber}`. */
  href?: string
  /** Plan version for mediaplans editor link when `campaignLinkMode` is `adminHub`. */
  version_number?: number
}

export interface CampaignSectionProps {
  /** Full list used for status filters, counts, and slicing. */
  allCampaigns?: Campaign[]
  /** @deprecated Prefer `allCampaigns`. */
  campaigns?: Campaign[]
  slug: string
  campaignLinkMode: "tenant" | "adminHub"
  /** Section heading; defaults to a label derived from the active status filter. */
  title?: string
  brandColour?: string
  defaultStatus?: CampaignStatus
  /** Max cards to show before linking users to the full list. */
  maxVisible?: number
  /** Override destination for “View all campaigns” (tenant + admin defaults apply when omitted). */
  viewAllHref?: string
}

const DEFAULT_MAX_VISIBLE = 6
const STATUS_PARAM = "status"
const LOCAL_STORAGE_KEY = "dashboard_campaign_status_filter"
const EMPTY_CAMPAIGNS: Campaign[] = []

function normalizeStatus(status: string): CampaignStatus {
  const normalized = status.toLowerCase().trim()
  if (normalized === "completed") return "completed"
  if (normalized === "live" || normalized === "booked") return "live"
  return "planned"
}

function statusMeta(status: CampaignStatus): {
  title: string
  emptyMessage: string
  badgeClass: string
  icon: ReactNode
} {
  if (status === "live") {
    return {
      title: "Live now",
      emptyMessage: "No campaigns are currently live",
      badgeClass: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
      icon: <Activity className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />,
    }
  }

  if (status === "planned") {
    return {
      title: "Planned campaigns",
      emptyMessage: "No campaigns in planning",
      badgeClass: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
      icon: <CalendarClock className="h-5 w-5 text-blue-600 dark:text-blue-400" />,
    }
  }

  return {
    title: "Completed campaigns",
    emptyMessage: "No completed campaigns yet",
    badgeClass: "bg-slate-500/15 text-slate-600 dark:text-slate-400",
    icon: <CheckCircle2 className="h-5 w-5 text-slate-600 dark:text-slate-400" />,
  }
}

function isValidStatus(value: string | null): value is CampaignStatus {
  return value === "live" || value === "planned" || value === "completed"
}

function buildDefaultViewAllHref(slug: string, campaignLinkMode: "tenant" | "adminHub"): string {
  if (campaignLinkMode === "tenant") {
    return `/dashboard/${encodeURIComponent(slug)}`
  }
  return `/client/${encodeURIComponent(slug)}`
}

export function CampaignSection({
  allCampaigns,
  campaigns: campaignsLegacy,
  defaultStatus = "live",
  brandColour,
  campaignLinkMode,
  slug,
  title: titleProp,
  maxVisible = DEFAULT_MAX_VISIBLE,
  viewAllHref: viewAllHrefProp,
}: CampaignSectionProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const sourceCampaigns = useMemo(
    () => allCampaigns ?? campaignsLegacy ?? EMPTY_CAMPAIGNS,
    [allCampaigns, campaignsLegacy]
  )

  const [activeStatus, setActiveStatus] = useState<CampaignStatus>(defaultStatus)

  useEffect(() => {
    const statusFromUrl = searchParams?.get(STATUS_PARAM) ?? null
    if (isValidStatus(statusFromUrl)) {
      setActiveStatus(statusFromUrl)
      return
    }

    const statusFromStorage = typeof window !== "undefined" ? window.localStorage.getItem(LOCAL_STORAGE_KEY) : null
    if (isValidStatus(statusFromStorage)) {
      setActiveStatus(statusFromStorage)
      return
    }

    setActiveStatus(defaultStatus)
  }, [defaultStatus, searchParams])

  const counts = useMemo(
    () =>
      sourceCampaigns.reduce(
        (acc, campaign) => {
          const key = normalizeStatus(campaign.status)
          acc[key] += 1
          return acc
        },
        { live: 0, planned: 0, completed: 0 }
      ),
    [sourceCampaigns]
  )

  const filtered = useMemo(
    () => sourceCampaigns.filter((campaign) => normalizeStatus(campaign.status) === activeStatus),
    [activeStatus, sourceCampaigns]
  )

  const visibleCampaigns = filtered.slice(0, maxVisible)
  const hasMore = filtered.length > maxVisible
  const moreCount = filtered.length - maxVisible
  const statusInfo = statusMeta(activeStatus)
  const heading = titleProp?.trim() ? titleProp : statusInfo.title

  const viewAllCampaignsHref = viewAllHrefProp ?? buildDefaultViewAllHref(slug, campaignLinkMode)

  const setStatus = (next: CampaignStatus) => {
    setActiveStatus(next)

    if (typeof window !== "undefined") {
      window.localStorage.setItem(LOCAL_STORAGE_KEY, next)
    }

    const params = new URLSearchParams(searchParams?.toString() ?? "")
    params.set(STATUS_PARAM, next)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  const campaignViewHref = (campaign: Campaign) =>
    campaign.href ?? `/dashboard/${encodeURIComponent(slug)}/${encodeURIComponent(campaign.mbaNumber)}`

  const campaignEditHref = (campaign: Campaign) => {
    if (campaignLinkMode !== "adminHub") return undefined
    if (campaign.version_number == null || Number.isNaN(campaign.version_number)) return undefined
    return `/mediaplans/mba/${encodeURIComponent(campaign.mbaNumber)}/edit?version=${campaign.version_number}`
  }

  const canEditCampaigns = campaignLinkMode === "adminHub"

  const viewAllLinkClass =
    "shrink-0 text-sm font-medium text-primary transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"

  return (
    <section className="space-y-4 lg:space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
          <div className="flex min-w-0 items-center gap-2">
            {activeStatus === "live" ? (
              <span className="inline-flex h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-emerald-500" aria-hidden />
            ) : null}
            <h2 className="truncate text-lg font-semibold text-foreground">{heading}</h2>
            <span className={cn("inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-medium", statusInfo.badgeClass)}>
              {counts[activeStatus].toLocaleString("en-US")}
            </span>
          </div>
          {activeStatus === "live" ? (
            <span className="text-sm text-muted-foreground">
              {filtered.length.toLocaleString("en-US")}{" "}
              {filtered.length === 1 ? "active campaign" : "active campaigns"}
            </span>
          ) : null}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end sm:gap-4">
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <CampaignStatusPills activeStatus={activeStatus} counts={counts} onChange={setStatus} />
          </div>
          <Link href={viewAllCampaignsHref} className={cn(viewAllLinkClass, "whitespace-nowrap")}>
            View all campaigns →
          </Link>
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeStatus}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.2 }}
        >
          {filtered.length === 0 ? (
            <div className="flex h-32 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 text-center">
              <div className="mb-2 rounded-full bg-muted p-2">{statusInfo.icon}</div>
              <p className="text-sm font-medium text-foreground">{statusInfo.emptyMessage}</p>
              <p className="mt-1 text-xs text-muted-foreground">No {activeStatus} campaigns to show here.</p>
              <Link href={viewAllCampaignsHref} className={cn(viewAllLinkClass, "mt-3")}>
                View all campaigns
              </Link>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5 xl:grid-cols-4 xl:gap-6 2xl:grid-cols-5">
                {visibleCampaigns.map((campaign, index) => (
                  <motion.div
                    key={campaign.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, delay: index * 0.03 }}
                  >
                    <CampaignCardCompact
                      id={campaign.id}
                      name={campaign.name}
                      mbaNumber={campaign.mbaNumber}
                      status={normalizeStatus(campaign.status)}
                      mediaTypes={campaign.mediaTypes}
                      spentAmount={campaign.spentAmount}
                      totalBudget={campaign.totalBudget}
                      href={campaignViewHref(campaign)}
                      editHref={campaignEditHref(campaign)}
                      canEdit={canEditCampaigns}
                      brandColour={brandColour}
                    />
                  </motion.div>
                ))}
              </div>

              {hasMore ? (
                <div className="flex justify-center pt-3">
                  <Link
                    href={viewAllCampaignsHref}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    +{moreCount.toLocaleString("en-US")} more campaigns — view all
                  </Link>
                </div>
              ) : null}
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </section>
  )
}
