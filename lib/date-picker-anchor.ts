import { startOfDay } from "date-fns"
import type { DateRange } from "react-day-picker"

export function isValidPickerDate(d: unknown): d is Date {
  return d instanceof Date && !Number.isNaN(d.getTime())
}

export function hasCampaignDateWindow(
  campaignStart?: Date | null,
  campaignEnd?: Date | null
): boolean {
  return isValidPickerDate(campaignStart) && isValidPickerDate(campaignEnd)
}

export function defaultMediaBurstStartDate(
  campaignStart?: Date | null,
  campaignEnd?: Date | null
): Date {
  if (hasCampaignDateWindow(campaignStart, campaignEnd)) {
    return startOfDay(campaignStart!)
  }
  return startOfDay(new Date())
}

export function defaultMediaBurstEndDate(
  campaignStart?: Date | null,
  campaignEnd?: Date | null
): Date {
  if (hasCampaignDateWindow(campaignStart, campaignEnd)) {
    return startOfDay(campaignEnd!)
  }
  return startOfDay(new Date())
}

export type DatePickerMonthContext =
  | { kind: "general" }
  | {
      kind: "media-burst"
      role: "start" | "end"
      campaignStart?: Date | null
      campaignEnd?: Date | null
    }

/** Month shown when the calendar opens: selected date if valid, otherwise campaign/today rules. */
export function resolveDatePickerMonth(
  selected: Date | null | undefined,
  ctx: DatePickerMonthContext
): Date {
  if (isValidPickerDate(selected)) {
    return selected
  }
  if (ctx.kind === "general") {
    return startOfDay(new Date())
  }
  return ctx.role === "start"
    ? defaultMediaBurstStartDate(ctx.campaignStart, ctx.campaignEnd)
    : defaultMediaBurstEndDate(ctx.campaignStart, ctx.campaignEnd)
}

/** First visible month for range pickers when opening the popover. */
export function resolveRangePickerMonth(range: DateRange | undefined): Date {
  if (isValidPickerDate(range?.from)) {
    return range!.from!
  }
  if (isValidPickerDate(range?.to)) {
    return range!.to!
  }
  return startOfDay(new Date())
}
