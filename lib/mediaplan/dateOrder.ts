/**
 * Campaign and burst end dates must fall on or after their start.
 * Comparison is the civil day. A missing or unreadable date is not an error.
 * Callers show the message; nothing here rewrites stored dates.
 */

import type { RefinementCtx } from "zod"
import { z } from "zod"

import { coerceBurstDateLocal } from "@/lib/mediaplan/burstDate"

export const END_BEFORE_START_MESSAGE =
  "End date must be on or after the start date"

export function endIsBeforeStart(start: unknown, end: unknown): boolean {
  const startDay = coerceBurstDateLocal(start as Date | string | null | undefined)
  const endDay = coerceBurstDateLocal(end as Date | string | null | undefined)
  if (!startDay || !endDay) return false
  return endDay.getTime() < startDay.getTime()
}

export function campaignDateOrderSuperRefine(
  data: { mp_campaigndates_start?: unknown; mp_campaigndates_end?: unknown },
  ctx: RefinementCtx,
): void {
  if (!endIsBeforeStart(data.mp_campaigndates_start, data.mp_campaigndates_end)) return
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: ["mp_campaigndates_end"],
    message: END_BEFORE_START_MESSAGE,
  })
}

type BurstCarrier = { bursts?: unknown }

export function lineGroupsHaveEndBeforeStart(
  groups: ReadonlyArray<ReadonlyArray<BurstCarrier> | null | undefined>,
): boolean {
  for (const group of groups) {
    if (!group) continue
    for (const line of group) {
      const bursts = Array.isArray(line?.bursts) ? line.bursts : []
      for (const burst of bursts) {
        if (!burst || typeof burst !== "object") continue
        const row = burst as {
          startDate?: unknown
          endDate?: unknown
          start_date?: unknown
          end_date?: unknown
        }
        if (endIsBeforeStart(row.startDate ?? row.start_date, row.endDate ?? row.end_date)) {
          return true
        }
      }
    }
  }
  return false
}
