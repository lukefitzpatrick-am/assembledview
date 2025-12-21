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















