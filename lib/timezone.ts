const MELBOURNE_TZ = "Australia/Melbourne"

type DateInput = Date | string | number

const getDateParts = (value: DateInput) => {
  const date = value instanceof Date ? value : new Date(value)
  if (isNaN(date.getTime())) {
    throw new Error("Invalid date input provided to timezone helper")
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MELBOURNE_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date)

  const year = parts.find((p) => p.type === "year")?.value
  const month = parts.find((p) => p.type === "month")?.value
  const day = parts.find((p) => p.type === "day")?.value

  if (!year || !month || !day) {
    throw new Error("Unable to extract date parts for Melbourne timezone")
  }

  return { year, month, day }
}

const getTimeZoneOffsetMinutes = (date: Date, timeZone: string) => {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })

  const parts = dtf.formatToParts(date)
  const filled = Object.fromEntries(parts.map((p) => [p.type, p.value]))

  const asUTC = Date.UTC(
    Number(filled.year),
    Number(filled.month) - 1,
    Number(filled.day),
    Number(filled.hour),
    Number(filled.minute),
    Number(filled.second)
  )

  return (asUTC - date.getTime()) / 60000
}

/**
 * Returns an ISO string anchored to midnight in Australia/Melbourne
 * for the provided date input.
 */
export const toMelbourneDateISOString = (value: DateInput) => {
  const { year, month, day } = getDateParts(value)
  const utcMidnight = Date.UTC(Number(year), Number(month) - 1, Number(day), 0, 0, 0)
  const offsetMinutes = getTimeZoneOffsetMinutes(new Date(utcMidnight), MELBOURNE_TZ)
  const melbourneMidnightUtc = new Date(utcMidnight - offsetMinutes * 60000)
  return melbourneMidnightUtc.toISOString()
}

/**
 * Returns a YYYY-MM-DD string for the date as it would be in
 * Australia/Melbourne.
 */
export const toMelbourneDateString = (value: DateInput) => {
  const { year, month, day } = getDateParts(value)
  return `${year}-${month}-${day}`
}

/**
 * Returns a YYYY-MM-DD string using the date's calendar parts as-is,
 * without applying any timezone normalization. Use this when you need
 * the exact day the user picked regardless of their locale.
 */
export const toDateOnlyString = (value: DateInput) => {
  const date = value instanceof Date ? value : new Date(value)
  if (isNaN(date.getTime())) {
    throw new Error("Invalid date input provided to date-only helper")
  }

  const year = date.getFullYear()
  const month = (date.getMonth() + 1).toString().padStart(2, "0")
  const day = date.getDate().toString().padStart(2, "0")
  return `${year}-${month}-${day}`
}

/**
 * Parses a YYYY-MM-DD string into a Date set to local midnight without
 * timezone shifts. Falls back to the native Date parser otherwise.
 */
export const parseDateOnlyString = (value: string): Date => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (match) {
    const [, y, m, d] = match
    return new Date(Number(y), Number(m) - 1, Number(d), 0, 0, 0)
  }
  const parsed = new Date(value)
  if (isNaN(parsed.getTime())) {
    throw new Error("Invalid date string provided to date-only parser")
  }
  return parsed
}




















































