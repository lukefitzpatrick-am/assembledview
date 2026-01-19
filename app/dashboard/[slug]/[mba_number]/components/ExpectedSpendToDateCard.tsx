"use client"

import { useEffect, useMemo, useState } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { SmallProgressCard, clampProgress } from "@/components/dashboard/pacing/SmallProgressCard"

type ExpectedSpendToDateCardProps = {
  mbaNumber: string
  campaignStart?: string
  campaignEnd?: string
  budget?: number
  actualSpend?: number
  asAtDate?: string
  currency?: string
  hideStatus?: boolean
}

type ApiResponse = {
  expectedSpendToDate?: number
  asOf?: string
  error?: string
}

function formatCurrency(value: number | undefined, currency = "AUD") {
  const num = typeof value === "number" && Number.isFinite(value) ? value : 0
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(num)
}

function getDayValueInZone(dateInput: string | Date | undefined, timeZone: string) {
  if (!dateInput) return null
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput)
  if (Number.isNaN(date.getTime())) return null

  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date)

  const year = Number(parts.find((p) => p.type === "year")?.value)
  const month = Number(parts.find((p) => p.type === "month")?.value)
  const day = Number(parts.find((p) => p.type === "day")?.value)

  if (![year, month, day].every((v) => Number.isFinite(v))) return null

  // Use UTC to avoid DST/timezone shift since we only care about the day number in the target zone.
  return Date.UTC(year, (month || 1) - 1, day || 1)
}

export default function ExpectedSpendToDateCard({
  mbaNumber,
  campaignStart,
  campaignEnd,
  budget,
  actualSpend: _actualSpend,
  asAtDate,
  currency,
  hideStatus,
}: ExpectedSpendToDateCardProps) {
  const [expectedSpend, setExpectedSpend] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!mbaNumber) {
      setExpectedSpend(null)
      setLoading(false)
      return
    }

    const controller = new AbortController()
    const load = async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams()
        if (campaignStart) params.set("campaignStart", campaignStart)
        if (campaignEnd) params.set("campaignEnd", campaignEnd)

        const query = params.toString()
        const url = `/api/mediaplans/mba/${encodeURIComponent(mbaNumber)}/expected-spend-to-date${
          query ? `?${query}` : ""
        }`

        const res = await fetch(url, { cache: "no-store", signal: controller.signal })
        if (!res.ok) {
          setExpectedSpend(null)
          return
        }
        const json = (await res.json()) as ApiResponse
        if (typeof json.expectedSpendToDate === "number" && Number.isFinite(json.expectedSpendToDate)) {
          setExpectedSpend(json.expectedSpendToDate)
        } else {
          setExpectedSpend(null)
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setExpectedSpend(null)
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }

    load()
    return () => controller.abort()
  }, [mbaNumber, campaignStart, campaignEnd])

  const spendHelper = useMemo(() => {
    if (budget) {
      return `Budget ${formatCurrency(budget, currency)}${asAtDate ? ` • As at ${asAtDate}` : ""}`
    }
    return asAtDate ? `As at ${asAtDate}` : undefined
  }, [budget, currency, asAtDate])

  const localExpectedSpend = useMemo(() => {
    const timeZone = "Australia/Sydney"
    const msPerDay = 1000 * 60 * 60 * 24

    if (typeof budget !== "number" || !Number.isFinite(budget) || budget < 0) return null

    const startMs = getDayValueInZone(campaignStart, timeZone)
    const endMs = getDayValueInZone(campaignEnd, timeZone)
    const todayMs = getDayValueInZone(new Date(), timeZone)

    if (startMs === null || endMs === null || todayMs === null) return null
    if (endMs < startMs) return null

    const totalDays = Math.floor((endMs - startMs) / msPerDay) + 1
    if (totalDays <= 0) return null

    if (todayMs < startMs) return 0
    if (todayMs > endMs) return budget

    const daysElapsed = Math.floor((todayMs - startMs) / msPerDay) + 1
    const expected = (budget / totalDays) * daysElapsed
    const clamped = Math.min(Math.max(expected, 0), budget)

    return Number.isFinite(clamped) ? clamped : null
  }, [budget, campaignStart, campaignEnd])

  const apiHasValue = typeof expectedSpend === "number" && Number.isFinite(expectedSpend)
  const fallbackHasValue = typeof localExpectedSpend === "number" && Number.isFinite(localExpectedSpend)
  const chosenExpected = apiHasValue ? expectedSpend : fallbackHasValue ? localExpectedSpend : 0

  const progressPct =
    typeof chosenExpected === "number" &&
    Number.isFinite(chosenExpected) &&
    chosenExpected >= 0 &&
    typeof budget === "number" &&
    Number.isFinite(budget) &&
    budget > 0
      ? Number(((chosenExpected / budget) * 100).toFixed(1))
      : undefined

  const pacingPct = progressPct

  const progressRatio = typeof progressPct === "number" ? clampProgress(progressPct / 100) : 0

  const value = loading ? (
    <Skeleton className="h-9 w-28 rounded-md" />
  ) : (
    <span>{formatCurrency(chosenExpected, currency)}</span>
  )

  return (
    <SmallProgressCard
      label="Expected spend to date"
      value={value}
      helper={spendHelper}
      pacingPct={pacingPct}
      progressRatio={progressRatio}
      accentColor="#8b5cf6"
      hideStatus={hideStatus}
    />
  )
}
