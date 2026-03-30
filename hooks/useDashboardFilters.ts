"use client"

import { useMemo } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

export type DashboardCampaignStatus = "live" | "planned" | "completed"

export interface DashboardFilterCampaign {
  status: string
}

export interface UseDashboardFiltersResult<TCampaign extends DashboardFilterCampaign> {
  activeStatus: DashboardCampaignStatus
  filteredCampaigns: TCampaign[]
  setActiveStatus: (status: DashboardCampaignStatus) => void
}

function normalizeStatus(status: string): DashboardCampaignStatus {
  const raw = status.toLowerCase()
  if (raw === "completed") return "completed"
  if (raw === "live" || raw === "booked" || raw === "approved") return "live"
  return "planned"
}

function isValidStatus(value: string | null): value is DashboardCampaignStatus {
  return value === "live" || value === "planned" || value === "completed"
}

export function useDashboardFilters<TCampaign extends DashboardFilterCampaign>(
  campaigns: TCampaign[],
  defaultStatus: DashboardCampaignStatus = "live"
): UseDashboardFiltersResult<TCampaign> {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const activeStatus = useMemo(() => {
    const fromUrl = searchParams?.get("status") ?? null
    return isValidStatus(fromUrl) ? fromUrl : defaultStatus
  }, [defaultStatus, searchParams])

  const filteredCampaigns = useMemo(
    () => campaigns.filter((campaign) => normalizeStatus(campaign.status) === activeStatus),
    [activeStatus, campaigns]
  )

  const setActiveStatus = (status: DashboardCampaignStatus) => {
    const params = new URLSearchParams(searchParams?.toString() ?? "")
    params.set("status", status)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  return { activeStatus, filteredCampaigns, setActiveStatus }
}
