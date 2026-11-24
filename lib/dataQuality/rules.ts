/**
 * The Data quality queue's rules (S17). Pure: the server writer, the screen
 * and the digest read the same keys, labels and overdue rule.
 *
 * Every check writes through `recordFindings` in `items.server.ts` (INVARIANTS).
 * A new check adds its rule keys here.
 */
import type { PublishRule } from "@/lib/mediaplan/publishValidation"

/** The publish validation refusals (S1), as queue rules on published versions. */
export const PUBLISH_RULES = [
  "no_publisher",
  "burst_end_before_start",
  "bursts_overlap",
  "burst_outside_plan_dates",
  "plan_dates_reversed",
  "package_no_quantity",
] as const satisfies readonly PublishRule[]

export type DataQualityRuleKey = `publish.${(typeof PUBLISH_RULES)[number]}` | "relabel.drift"

const DATA_QUALITY_RULES: Readonly<Record<DataQualityRuleKey, { label: string; overdueDays?: number }>> = {
  "publish.no_publisher": { label: "Line has no publisher" },
  "publish.burst_end_before_start": { label: "Burst ends before it starts" },
  "publish.bursts_overlap": { label: "Bursts overlap on a line" },
  "publish.burst_outside_plan_dates": { label: "Burst outside the plan dates" },
  "publish.plan_dates_reversed": { label: "Plan dates reversed" },
  "publish.package_no_quantity": { label: "Package line with no quantity" },
  "relabel.drift": { label: "Relabel drift" },
}

/** An item is overdue once it has been open more than this many days, unless its rule says otherwise. */
const OVERDUE_AFTER_DAYS = 3

const DAY_MS = 86_400_000

export function ruleLabel(ruleKey: string): string {
  return DATA_QUALITY_RULES[ruleKey as DataQualityRuleKey]?.label ?? ruleKey
}

/** Whole days since the item was first seen (0 on the first day). */
export function daysOpen(firstSeenAt: string, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(firstSeenAt).getTime()) / DAY_MS))
}

export function isOverdue(item: { ruleKey: string; firstSeenAt: string }, now: Date): boolean {
  const limit = DATA_QUALITY_RULES[item.ruleKey as DataQualityRuleKey]?.overdueDays ?? OVERDUE_AFTER_DAYS
  return daysOpen(item.firstSeenAt, now) > limit
}

/** An open item as the screen and the digest read it. */
export type DataQualityItem = {
  id: number
  ruleKey: string
  mbaNumber: string
  lineItemId: string | null
  clientId: number | null
  clientName: string | null
  message: string
  fixLabel: string
  fixHref: string
  ownerEmail: string | null
  ownerName: string | null
  firstSeenAt: string
  lastSeenAt: string
}
