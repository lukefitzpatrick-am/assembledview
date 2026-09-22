/**
 * The `line_channel` values as a plain tuple, with no drizzle import.
 *
 * `db/schema/enums.ts` builds `lineChannelEnum` from this list, so Postgres and
 * the UI stay on one source of truth. Modules that only need the values or the
 * `LineChannel` type — including "use client" ones — must import from here:
 * taking them from `@/db/schema` pulls `drizzle-orm/pg-core` into the client
 * bundle, because `LINE_CHANNELS` was `lineChannelEnum.enumValues`.
 *
 * Order is the Postgres enum order. Appending is safe; reordering is not.
 */
export const LINE_CHANNELS = [
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
] as const

export type LineChannel = (typeof LINE_CHANNELS)[number]
