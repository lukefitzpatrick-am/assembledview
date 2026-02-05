import { roundMoney4 } from "@/lib/utils/money"

const MELBOURNE_TZ = "Australia/Melbourne"

const MONTH_NAMES = [
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

type DeliveryMonth = {
  monthYear?: string
  lineItems?: Array<{ amount?: unknown }>
  feeTotal?: unknown
  production?: unknown
  adservingTechFees?: unknown
}

type DateParts = {
  year: number
  month: number
  day: number
}

type MonthParts = {
  year: number
  monthIndex: number
}

export const formatCurrencyAUD = (value: number) =>
  new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(value)

export const calculateExpectedSpendToDateFromDeliverySchedule = (
  deliverySchedule: unknown,
  campaignStart?: string | Date,
  campaignEnd?: string | Date,
  asAt: Date = new Date()
) => {
  const months = normalizeDeliverySchedule(deliverySchedule)
  if (!months.length) return 0

  const asAtParts = getMelbourneDateParts(asAt)
  const campaignStartParts = parseOptionalDateParts(campaignStart)
  const campaignEndParts = parseOptionalDateParts(campaignEnd)

  if (campaignStartParts && compareDateKeys(asAtParts, campaignStartParts) < 0) {
    return 0
  }

  const totalPlanned = months.reduce(
    (sum, month) => sum + getMonthPlannedSpend(month),
    0
  )

  if (campaignEndParts && compareDateKeys(asAtParts, campaignEndParts) > 0) {
    return totalPlanned
  }

  const asAtMonthKey = monthKey(asAtParts.year, asAtParts.month)
  let expectedSpend = 0

  for (const month of months) {
    const parsedMonth = parseMonthYear(month?.monthYear)
    if (!parsedMonth) continue

    const currentMonthKey = monthKey(parsedMonth.year, parsedMonth.monthIndex + 1)
    const plannedSpend = getMonthPlannedSpend(month)

    if (currentMonthKey < asAtMonthKey) {
      expectedSpend += plannedSpend
      continue
    }

    if (currentMonthKey > asAtMonthKey) {
      continue
    }

    const fraction = getAsAtMonthFraction({
      monthYear: parsedMonth,
      asAtDay: asAtParts.day,
      campaignStartParts,
      campaignEndParts,
    })

    expectedSpend += plannedSpend * fraction
  }

  return roundMoney4(expectedSpend)
}

const normalizeDeliverySchedule = (deliverySchedule: unknown): DeliveryMonth[] => {
  if (!deliverySchedule) return []

  let parsed = deliverySchedule
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed)
    } catch {
      return []
    }
  }

  if (Array.isArray(parsed)) {
    return parsed as DeliveryMonth[]
  }

  if (typeof parsed === "object" && parsed !== null && "months" in parsed) {
    const months = (parsed as { months?: unknown }).months
    if (Array.isArray(months)) {
      return months as DeliveryMonth[]
    }
  }

  return []
}

const getMonthPlannedSpend = (month: DeliveryMonth): number => {
  const lineItems = Array.isArray(month.lineItems) ? month.lineItems : []
  const lineItemsTotal = lineItems.reduce(
    (sum, item) => sum + parseCurrencyValue(item?.amount),
    0
  )

  return (
    lineItemsTotal +
    parseCurrencyValue(month.feeTotal) +
    parseCurrencyValue(month.production) +
    parseCurrencyValue(month.adservingTechFees)
  )
}

const parseCurrencyValue = (value: unknown): number => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0
  }

  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.-]+/g, "")
    if (!cleaned) return 0
    const parsed = Number.parseFloat(cleaned)
    return Number.isFinite(parsed) ? parsed : 0
  }

  return 0
}

const parseMonthYear = (value?: string): MonthParts | null => {
  if (!value || typeof value !== "string") return null
  const match = value.trim().match(/^([A-Za-z]+)\s+(\d{4})$/)
  if (!match) return null

  const [, monthName, yearString] = match
  const monthIndex = MONTH_NAMES.indexOf(monthName.toLowerCase())
  if (monthIndex === -1) return null

  const year = Number(yearString)
  if (!Number.isFinite(year)) return null

  return { year, monthIndex }
}

const getMelbourneDateParts = (value: Date): DateParts => {
  const date = value instanceof Date ? value : new Date(value)
  if (isNaN(date.getTime())) {
    throw new Error("Invalid date input provided to spend calculator")
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MELBOURNE_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date)

  const year = Number(parts.find((p) => p.type === "year")?.value)
  const month = Number(parts.find((p) => p.type === "month")?.value)
  const day = Number(parts.find((p) => p.type === "day")?.value)

  if (!year || !month || !day) {
    throw new Error("Unable to extract date parts for Melbourne timezone")
  }

  return { year, month, day }
}

const parseOptionalDateParts = (
  value?: string | Date
): DateParts | undefined => {
  if (!value) return undefined
  const date = value instanceof Date ? value : new Date(value)
  if (isNaN(date.getTime())) return undefined
  return getMelbourneDateParts(date)
}

const compareDateKeys = (a: DateParts, b: DateParts) =>
  dateKey(a.year, a.month, a.day) - dateKey(b.year, b.month, b.day)

const dateKey = (year: number, month: number, day: number) =>
  year * 10000 + month * 100 + day

const monthKey = (year: number, month: number) => year * 100 + month

const getAsAtMonthFraction = ({
  monthYear,
  asAtDay,
  campaignStartParts,
  campaignEndParts,
}: {
  monthYear: MonthParts
  asAtDay: number
  campaignStartParts?: DateParts
  campaignEndParts?: DateParts
}) => {
  const daysInMonth = new Date(
    Date.UTC(monthYear.year, monthYear.monthIndex + 1, 0)
  ).getUTCDate()

  let windowStartDay = 1
  let windowEndDay = daysInMonth

  if (
    campaignStartParts &&
    campaignStartParts.year === monthYear.year &&
    campaignStartParts.month === monthYear.monthIndex + 1
  ) {
    windowStartDay = Math.max(windowStartDay, campaignStartParts.day)
  }

  if (
    campaignEndParts &&
    campaignEndParts.year === monthYear.year &&
    campaignEndParts.month === monthYear.monthIndex + 1
  ) {
    windowEndDay = Math.min(windowEndDay, campaignEndParts.day)
  }

  if (windowEndDay < windowStartDay) return 0

  const elapsedDays = Math.min(asAtDay, windowEndDay) - windowStartDay + 1
  if (elapsedDays <= 0) return 0

  const totalWindowDays = windowEndDay - windowStartDay + 1
  return Math.min(1, Math.max(0, elapsedDays / totalWindowDays))
}
