import { NextResponse } from "next/server"
import { normaliseLineItemsByType } from "@/lib/mediaplan/normalizeLineItem"
import { parseDateOnlyString } from "@/lib/timezone"

const DEBUG_SPEND = process.env.NEXT_PUBLIC_DEBUG_SPEND === "true"

type NormalizedBurst = {
  startDate: string
  endDate: string
  budget: number
}

function parseAmount(value: any): number {
  if (value === null || value === undefined) return 0
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.-]+/g, "")
    const parsed = Number(cleaned)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function parseDateSafe(value?: string | Date | null): Date | null {
  if (!value) return null
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(value)
  }
  if (typeof value === "string") {
    try {
      return parseDateOnlyString(value)
    } catch {
      const parsed = new Date(value)
      return Number.isNaN(parsed.getTime()) ? null : parsed
    }
  }
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function startOfDay(date: Date) {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next
}

function endOfDay(date: Date) {
  const next = new Date(date)
  next.setHours(23, 59, 59, 999)
  return next
}

function daysBetweenInclusive(start: Date, end: Date): number {
  const startTime = startOfDay(start).getTime()
  const endTime = startOfDay(end).getTime()
  if (endTime < startTime) return 0
  return Math.floor((endTime - startTime) / (1000 * 60 * 60 * 24)) + 1
}

function normalizeBursts(lineItems: Record<string, any[]>): NormalizedBurst[] {
  const normalized = normaliseLineItemsByType(lineItems || {})
  const bursts: NormalizedBurst[] = []

  Object.values(normalized).forEach((items) => {
    items.forEach((item) => {
      item.bursts.forEach((burst) => {
        const budget = parseAmount(burst.budget ?? burst.deliverablesAmount)
        if (!budget) return
        if (!burst.startDate && !burst.endDate) return
        bursts.push({
          startDate: burst.startDate,
          endDate: burst.endDate || burst.startDate,
          budget,
        })
      })
    })
  })

  return bursts
}

function computeExpectedSpendToDate(params: {
  bursts: NormalizedBurst[]
  campaignStart?: string | Date | null
  campaignEnd?: string | Date | null
  today?: Date
}) {
  const { bursts, campaignStart, today = new Date() } = params
  const safeCampaignStart = parseDateSafe(campaignStart)
  if (!safeCampaignStart || !bursts.length) {
    return 0
  }

  const campaignStartDay = startOfDay(safeCampaignStart)
  const todayEnd = endOfDay(today)

  const total = bursts.reduce((sum, burst) => {
    const burstStartRaw = parseDateSafe(burst.startDate)
    const burstEndRaw = parseDateSafe(burst.endDate) ?? burstStartRaw
    if (!burstStartRaw || !burstEndRaw) return sum

    const burstStart = startOfDay(burstStartRaw)
    const burstEnd = endOfDay(burstEndRaw)
    if (burstEnd < burstStart) return sum

    const elapsedStart = burstStart > campaignStartDay ? burstStart : campaignStartDay
    const elapsedEnd = burstEnd < todayEnd ? burstEnd : todayEnd

    if (elapsedEnd < elapsedStart) return sum

    const burstDurationMs = burstEnd.getTime() - burstStart.getTime()
    const elapsedMs = elapsedEnd.getTime() - elapsedStart.getTime()
    if (burstDurationMs <= 0 || elapsedMs <= 0) return sum

    const rawExpected = burst.budget * (elapsedMs / burstDurationMs)
    const clamped = Math.min(burst.budget, Math.max(0, rawExpected))
    return sum + clamped
  }, 0)

  return Number(total.toFixed(2))
}

function parseMonthLabel(label: any): { start: Date; end: Date } | null {
  if (!label) return null

  const tryBuild = (year: number, monthIndex: number) => {
    if (!Number.isFinite(year) || monthIndex < 0 || monthIndex > 11) return null
    const start = new Date(Date.UTC(year, monthIndex, 1))
    const end = new Date(Date.UTC(year, monthIndex + 1, 0, 23, 59, 59, 999))
    return { start, end }
  }

  if (typeof label === "number" && Number.isFinite(label)) {
    const str = String(label)
    if (str.length === 6) {
      const year = Number(str.slice(0, 4))
      const month = Number(str.slice(4, 6)) - 1
      const res = tryBuild(year, month)
      if (res) return res
    }
  }

  if (typeof label === "string") {
    const trimmed = label.trim()
    if (!trimmed) return null

    const isoLike = trimmed.match(/^(\d{4})[-/](\d{1,2})/)
    if (isoLike) {
      const year = Number(isoLike[1])
      const month = Number(isoLike[2]) - 1
      const res = tryBuild(year, month)
      if (res) return res
    }

    const monthNames = [
      "january",
      "february",
      "march",
      "april",
      "may",
      "june",
      "july",
      "august",
      "september",
      "october",
      "november",
      "december",
    ]
    const nameMatch = trimmed.match(
      /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i
    )
    if (nameMatch) {
      const idx = monthNames.indexOf(nameMatch[1].toLowerCase())
      const year = Number(nameMatch[2])
      const res = tryBuild(year, idx)
      if (res) return res
    }

    const parsed = new Date(trimmed)
    if (!Number.isNaN(parsed.getTime())) {
      const year = parsed.getUTCFullYear()
      const monthIdx = parsed.getUTCMonth()
      return tryBuild(year, monthIdx)
    }
  }

  return null
}

function sumMonthlyEntryAmount(entry: any): number {
  if (!entry) return 0
  if (Array.isArray(entry?.data)) {
    return entry.data.reduce((sum: number, item: any) => sum + (parseAmount(item?.amount) || 0), 0)
  }
  if (typeof entry === "object") {
    return Object.entries(entry).reduce((sum, [key, value]) => {
      if (
        key === "month" ||
        key === "monthYear" ||
        key === "month_year" ||
        key === "month_label" ||
        key === "monthLabel" ||
        key === "label" ||
        key === "date"
      )
        return sum
      const num = typeof value === "number" ? value : parseAmount(value)
      return sum + (Number.isFinite(num) ? num : 0)
    }, 0)
  }
  return 0
}

function computeExpectedFromMonthlySpend(params: {
  monthlySpend: any
  campaignStart?: string | Date | null
  campaignEnd?: string | Date | null
  today?: Date
}): number | null {
  const { monthlySpend, campaignStart, campaignEnd, today = new Date() } = params
  if (!Array.isArray(monthlySpend) || monthlySpend.length === 0) return null

  const campaignStartDate = parseDateSafe(campaignStart)
  const campaignEndDate = parseDateSafe(campaignEnd)
  if (!campaignStartDate || !campaignEndDate) return null

  const campaignStartDay = startOfDay(campaignStartDate)
  const campaignEndDay = endOfDay(campaignEndDate)
  const todayEnd = endOfDay(today)

  let total = 0

  monthlySpend.forEach((entry: any) => {
    const monthLabel =
      entry?.month ??
      entry?.monthYear ??
      entry?.month_year ??
      entry?.monthLabel ??
      entry?.month_label ??
      entry?.label ??
      entry?.date
    const range = parseMonthLabel(monthLabel)
    if (!range) return

    // If month entirely before campaign or after today, skip
    const windowStart = startOfDay(range.start)
    const windowEnd = endOfDay(range.end)

    const activeStart = windowStart > campaignStartDay ? windowStart : campaignStartDay
    const activeEndCandidate = windowEnd < campaignEndDay ? windowEnd : campaignEndDay
    const activeEnd = activeEndCandidate < todayEnd ? activeEndCandidate : todayEnd

    if (activeEnd < activeStart) return

    const monthBudget = sumMonthlyEntryAmount(entry)
    if (!monthBudget) return

    const activeWindowEnd = activeEndCandidate
    const totalActiveDays = daysBetweenInclusive(activeStart, activeWindowEnd)
    if (totalActiveDays <= 0) return

    const elapsedDays = daysBetweenInclusive(activeStart, activeEnd)
    if (elapsedDays <= 0) return

    const weighted = monthBudget * (elapsedDays / totalActiveDays)
    total += weighted

    if (DEBUG_SPEND) {
      console.log("[expected-spend-to-date] monthly entry", {
        monthLabel,
        monthBudget,
        activeStart: activeStart.toISOString(),
        activeEnd: activeEnd.toISOString(),
        totalActiveDays,
        elapsedDays,
        weighted,
      })
    }
  })

  if (DEBUG_SPEND) {
    console.log("[expected-spend-to-date] monthly spend summary", {
      monthlyCount: monthlySpend.length,
      total,
    })
  }

  return Number(total.toFixed(2))
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ mba_number: string }> }
) {
  try {
    const { mba_number } = await params
    const requestUrl = new URL(request.url)
    const campaignStartParam = requestUrl.searchParams.get("campaignStart")
    const campaignEndParam = requestUrl.searchParams.get("campaignEnd")

    const baseUrl = `${requestUrl.protocol}//${requestUrl.host}`
    const mediaPlanUrl = `${baseUrl}/api/mediaplans/mba/${encodeURIComponent(mba_number)}`

    const response = await fetch(mediaPlanUrl, {
      cache: "no-store",
      headers: {
        cookie: request.headers.get("cookie") ?? "",
      },
    })
    if (!response.ok) {
      const body = await response.text().catch(() => "")
      if (DEBUG_SPEND) {
        console.log("[expected-spend-to-date] fetch media plan failed", {
          url: mediaPlanUrl,
          status: response.status,
          statusText: response.statusText,
          body,
        })
      }
      return NextResponse.json(
        { error: "Failed to load media plan data", details: body },
        { status: response.status }
      )
    }

    const data = await response.json()
    const campaignStart =
      data?.campaign_start_date ||
      data?.mp_campaigndates_start ||
      data?.versionData?.campaign_start_date ||
      data?.versionData?.mp_campaigndates_start ||
      campaignStartParam
    const campaignEnd =
      data?.campaign_end_date ||
      data?.mp_campaigndates_end ||
      data?.versionData?.campaign_end_date ||
      data?.versionData?.mp_campaigndates_end ||
      campaignEndParam

    const lineItems = data?.lineItems ?? {}
    const bursts = normalizeBursts(lineItems)

    const monthlySpendData =
      (data?.metrics?.deliveryMonthlySpend && data.metrics.deliveryMonthlySpend.length > 0
        ? data.metrics.deliveryMonthlySpend
        : data?.metrics?.monthlySpend) || []

    if (DEBUG_SPEND) {
      console.log("[expected-spend-to-date] inputs", {
        mba_number,
        campaignStart,
        campaignEnd,
        monthlyCount: Array.isArray(monthlySpendData) ? monthlySpendData.length : 0,
        hasDeliveryMonthlySpend: Array.isArray(data?.metrics?.deliveryMonthlySpend),
        hasMonthlySpend: Array.isArray(data?.metrics?.monthlySpend),
        burstsCount: bursts.length,
      })
      const sample = Array.isArray(monthlySpendData) ? monthlySpendData.slice(0, 3) : []
      console.log("[expected-spend-to-date] monthlySpend sample", sample)
    }

    const expectedFromMonthly =
      computeExpectedFromMonthlySpend({
        monthlySpend: monthlySpendData,
        campaignStart,
        campaignEnd,
      }) ?? null

  const expectedSpendToDate =
    expectedFromMonthly !== null
      ? expectedFromMonthly
      : computeExpectedSpendToDate({
          bursts,
          campaignStart,
          campaignEnd,
        })

    if (DEBUG_SPEND) {
      console.log("[expected-spend-to-date] result", {
        expectedFromMonthly,
        expectedFromBursts: computeExpectedSpendToDate({
          bursts,
          campaignStart,
          campaignEnd,
        }),
        chosen: expectedSpendToDate,
      })
    }

    return NextResponse.json({
      expectedSpendToDate,
      asOf: new Date().toISOString(),
    })
  } catch (error) {
    console.error("[expected-spend-to-date] failed", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected error" },
      { status: 500 }
    )
  }
}
