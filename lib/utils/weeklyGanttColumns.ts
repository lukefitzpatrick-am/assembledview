import {
  addWeeks,
  clamp,
  endOfWeek,
  format,
  startOfDay,
  startOfWeek,
} from "date-fns"
import { enAU } from "date-fns/locale/en-AU"

/** One week column for Expert Mode schedule / Gantt grids. */
export type WeeklyGanttWeekColumn = {
  weekKey: string
  weekStart: Date
  weekEnd: Date
  labelShort: string
  labelFull: string
}

/** Day the week starts on: 0=Sunday … 6=Saturday (date-fns convention). */
export type WeekStartsOn = 0 | 1 | 2 | 3 | 4 | 5 | 6

const labelLocale = enAU

function weekOptions(weekStartsOn: WeekStartsOn) {
  return { weekStartsOn }
}

/**
 * Calendar week-start on or before `date`, at local start of day.
 * Default `weekStartsOn=0` (Sunday) matches historic Sunday tiling.
 */
export function getSundayOnOrBefore(
  date: Date,
  weekStartsOn: WeekStartsOn = 0
): Date {
  return startOfWeek(startOfDay(date), weekOptions(weekStartsOn))
}

/**
 * Last instant of the calendar week-end on or after `date`.
 * Default `weekStartsOn=0` → Saturday end (Sunday-start weeks).
 */
export function getSaturdayOnOrAfter(
  date: Date,
  weekStartsOn: WeekStartsOn = 0
): Date {
  return endOfWeek(startOfDay(date), weekOptions(weekStartsOn))
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
 * Builds week columns from campaign bounds for Expert Mode grids.
 * First column: week whose start day is on or before `campaignStartDate`.
 * Last column: week whose end day is on or after `campaignEndDate`.
 * Default `weekStartsOn=0` (Sunday) reproduces the historic Sunday–Saturday output.
 */
export function buildWeeklyGanttColumnsFromCampaign(
  campaignStartDate: Date,
  campaignEndDate: Date,
  weekStartsOn: WeekStartsOn = 0
): WeeklyGanttWeekColumn[] {
  const opts = weekOptions(weekStartsOn)
  const startBound = startOfDay(campaignStartDate)
  const endBound = startOfDay(campaignEndDate)
  if (endBound.getTime() < startBound.getTime()) {
    return []
  }

  const firstWeekStart = getSundayOnOrBefore(campaignStartDate, weekStartsOn)
  const lastWeekEnd = getSaturdayOnOrAfter(campaignEndDate, weekStartsOn)
  const lastWeekStart = startOfWeek(lastWeekEnd, opts)

  const columns: WeeklyGanttWeekColumn[] = []
  for (
    let weekStart = firstWeekStart;
    weekStart.getTime() <= lastWeekStart.getTime();
    weekStart = addWeeks(weekStart, 1)
  ) {
    const weekEnd = endOfWeek(weekStart, opts)
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
