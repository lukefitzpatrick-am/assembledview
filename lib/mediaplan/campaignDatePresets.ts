import {
  addMonths,
  endOfMonth,
  endOfQuarter,
  startOfMonth,
  startOfQuarter,
  startOfDay,
  endOfDay,
} from "date-fns"
import { australianFyStartYearForDate } from "@/lib/finance/months"

export type CampaignDateRange = { start: Date; end: Date }

/** Default create/edit window: first → last day of the current calendar month. */
export function defaultCampaignDateRange(today: Date = new Date()): CampaignDateRange {
  return {
    start: startOfDay(startOfMonth(today)),
    end: endOfDay(endOfMonth(today)),
  }
}

export type CampaignDatePresetId =
  | "this-month"
  | "this-quarter"
  | "fy"
  | "annual-plan"
  | "12-months"

export const CAMPAIGN_DATE_PRESETS: ReadonlyArray<{
  id: CampaignDatePresetId
  label: string
}> = [
  { id: "this-month", label: "This month" },
  { id: "this-quarter", label: "This quarter" },
  { id: "fy", label: "FY" },
  { id: "12-months", label: "12 months" },
]

/** Planner Stage A pills. Create/edit keep `CAMPAIGN_DATE_PRESETS` (no annual-plan). */
export const PLANNER_DATE_PRESETS: ReadonlyArray<{
  id: CampaignDatePresetId
  label: string
}> = [
  { id: "this-month", label: "This month" },
  { id: "this-quarter", label: "This quarter" },
  { id: "fy", label: "FY" },
  { id: "annual-plan", label: "Annual plan" },
  { id: "12-months", label: "12 months" },
]

/** Resolve a quick-preset range (Australian FY = 1 Jul → 30 Jun). */
export function campaignDateRangeForPreset(
  id: CampaignDatePresetId,
  today: Date = new Date()
): CampaignDateRange {
  switch (id) {
    case "this-month":
      return defaultCampaignDateRange(today)
    case "this-quarter":
      return {
        start: startOfDay(startOfQuarter(today)),
        end: endOfDay(endOfQuarter(today)),
      }
    case "fy": {
      const fyStartYear = australianFyStartYearForDate(today)
      return {
        start: startOfDay(new Date(fyStartYear, 6, 1)),
        end: endOfDay(new Date(fyStartYear + 1, 5, 30)),
      }
    }
    case "annual-plan":
      return {
        start: startOfDay(startOfMonth(addMonths(today, 1))),
        end: endOfDay(endOfMonth(addMonths(today, 12))),
      }
    case "12-months":
      return {
        start: startOfDay(today),
        end: endOfDay(addMonths(today, 12)),
      }
  }
}
