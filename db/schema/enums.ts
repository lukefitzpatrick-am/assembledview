import { pgEnum } from "drizzle-orm/pg-core"

import { LINE_CHANNELS } from "./lineChannelValues"

export const lineChannelEnum = pgEnum("line_channel", LINE_CHANNELS)

export const scheduleComponentEnum = pgEnum("schedule_component", [
  "media",
  "fee",
  "adserving",
])
export const scheduleBasisEnum = pgEnum("schedule_basis", [
  "billing",
  "delivery",
])
export const scheduleSourceEnum = pgEnum("schedule_source", [
  "computed",
  "override",
])

export { LINE_CHANNELS } from "./lineChannelValues"
export type { LineChannel } from "./lineChannelValues"

export const financePeriodStatusEnum = pgEnum("finance_period_status", [
  "open",
  "pre_run_review",
  "run",
  "review",
  "locked",
  "invoiced",
  "reconciled",
])

export const financeRunItemStatusEnum = pgEnum("finance_run_item_status", [
  "pending",
  "approved",
  "adjusted",
  "held",
  "excluded",
  "stale",
])

export const financeRunSourceEnum = pgEnum("finance_run_source", [
  "media",
  "retainer",
  "sow",
])

export const xeroMatchMethodEnum = pgEnum("xero_match_method", [
  "reference",
  "heuristic",
  "manual",
])

export const xeroMatchStatusEnum = pgEnum("xero_match_status", [
  "matched",
  "diverged",
  "disputed",
  "written_off",
])
