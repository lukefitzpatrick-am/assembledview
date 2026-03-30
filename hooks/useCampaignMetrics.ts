"use client"

import { useMemo } from "react"
import { differenceInCalendarDays } from "date-fns"

import { getPacingStatus } from "@/lib/campaign/pacingStatus"

export type CampaignMetricsInput = {
  startDate?: string
  endDate?: string
  budget?: number
  actualSpend?: number
  expectedSpend?: number
}

function safeDate(value?: string): Date | null {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function useCampaignMetrics(campaign: CampaignMetricsInput) {
  return useMemo(() => {
    const today = new Date()
    const start = safeDate(campaign.startDate)
    const end = safeDate(campaign.endDate)

    const daysInCampaign =
      start && end ? Math.max(1, differenceInCalendarDays(end, start) + 1) : 0
    const daysElapsed =
      start && end
        ? Math.max(0, Math.min(daysInCampaign, differenceInCalendarDays(today, start) + 1))
        : 0
    const daysRemaining =
      end ? Math.max(0, differenceInCalendarDays(end, today)) : 0

    const timeElapsedPct =
      daysInCampaign > 0 ? (daysElapsed / daysInCampaign) * 100 : 0

    const budget = Number.isFinite(campaign.budget) ? Number(campaign.budget) : 0
    const actualSpend = Number.isFinite(campaign.actualSpend) ? Number(campaign.actualSpend) : 0
    const expectedSpend = Number.isFinite(campaign.expectedSpend)
      ? Number(campaign.expectedSpend)
      : 0

    const budgetUtilization = budget > 0 ? (actualSpend / budget) * 100 : 0
    const pacingReference = expectedSpend > 0 ? (actualSpend / expectedSpend) * 100 : budgetUtilization
    const pacingStatus = getPacingStatus(pacingReference)

    return {
      timeElapsedPct,
      daysRemaining,
      budgetUtilization,
      pacingStatus,
      isOverBudget: budget > 0 ? actualSpend > budget : false,
      isNearEnd: daysRemaining > 0 && daysRemaining <= 14,
      daysInCampaign,
      daysElapsed,
      pacingPct: pacingReference,
    }
  }, [campaign])
}
