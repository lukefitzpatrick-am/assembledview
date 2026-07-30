import { pgEnum } from "drizzle-orm/pg-core"

export const lineChannelEnum = pgEnum("line_channel", [
  "television",
  "radio",
  "cinema",
  "newspaper",
  "magazines",
  "ooh",
  "prog_display",
  "prog_video",
  "prog_audio",
  "prog_bvod",
  "prog_ooh",
  "digi_display",
  "digi_video",
  "digi_audio",
  "digi_bvod",
  "social",
  "search",
  "influencers",
  "integrations",
  "production",
])

export const scheduleComponentEnum = pgEnum("schedule_component", [
  "media",
  "fee",
])
export const scheduleBasisEnum = pgEnum("schedule_basis", [
  "billing",
  "delivery",
])
export const scheduleSourceEnum = pgEnum("schedule_source", [
  "computed",
  "override",
])

export const LINE_CHANNELS = lineChannelEnum.enumValues
export type LineChannel = (typeof LINE_CHANNELS)[number]
