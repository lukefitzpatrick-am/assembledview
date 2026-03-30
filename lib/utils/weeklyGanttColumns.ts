import { addWeeks, clamp, endOfWeek, format, startOfDay, startOfWeek } from "date-fns"
import { enAU } from "date-fns/locale/en-AU"

/** One week column for Expert Mode schedule / Gantt grids (Sunday–Saturday). */
export type WeeklyGanttWeekColumn = {
  weekKey: string
  weekStart: Date
  weekEnd: Date
  labelShort: string
  labelFull: string
}

const weekOptions = { weekStartsOn: 0 as const }

const labelLocale = enAU

/**
 * Calendar Sunday on or before `date`, at local start of day.
 * Uses local calendar fields (not UTC) so behaviour matches `setHours(0,0,0,0)` usage elsewhere.
 */
export function getSundayOnOrBefore(date: Date): Date {
  return startOfWeek(startOfDay(date), weekOptions)
}

/**
 * Last instant of the calendar Saturday on or after `date` (local week Sunday–Saturday).
 */
export function getSaturdayOnOrAfter(date: Date): Date {
  return endOfWeek(startOfDay(date), weekOptions)
}

/**
 * Clamps a calendar day to the inclusive campaign range using local date boundaries.
 */
export function clampDateToCampaignRange(
  date: Date,
  campaignStartDate: Date,
  campaignEndDate: Date
): Date {
  const interval = {
    start: startOfDay(campaignStartDate),
    end: startOfDay(campaignEndDate),
  }
  return clamp(startOfDay(date), interval)
}

/**
 * Builds Sunday-start week columns from campaign bounds for Expert Mode grids.
 * First column: week whose Sunday is on or before `campaignStartDate`.
 * Last column: week whose Saturday is on or after `campaignEndDate`.
 */
export function buildWeeklyGanttColumnsFromCampaign(
  campaignStartDate: Date,
  campaignEndDate: Date
): WeeklyGanttWeekColumn[] {
  const startBound = startOfDay(campaignStartDate)
  const endBound = startOfDay(campaignEndDate)
  if (endBound.getTime() < startBound.getTime()) {
    return []
  }

  const firstSunday = getSundayOnOrBefore(campaignStartDate)
  const lastSaturdayEnd = getSaturdayOnOrAfter(campaignEndDate)
  const lastSunday = startOfWeek(lastSaturdayEnd, weekOptions)

  const columns: WeeklyGanttWeekColumn[] = []
  for (
    let weekStart = firstSunday;
    weekStart.getTime() <= lastSunday.getTime();
    weekStart = addWeeks(weekStart, 1)
  ) {
    const weekEnd = endOfWeek(weekStart, weekOptions)
    const weekKey = format(weekStart, "yyyy-MM-dd")
    const labelShort = format(weekStart, "d MMM", { locale: labelLocale })
    const labelFull = `${format(weekStart, "EEE d MMM", { locale: labelLocale })} - ${format(weekEnd, "EEE d MMM", { locale: labelLocale })}`
    columns.push({
      weekKey,
      weekStart: new Date(weekStart),
      weekEnd: new Date(weekEnd),
      labelShort,
      labelFull,
    })
  }

  return columns
}
