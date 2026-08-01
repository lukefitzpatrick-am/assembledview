/**
 * Curated channelGroup rollup over the 20-value `line_channel` enum.
 * Proposed for Investment cut sign-off — labels are stable API values.
 */

import { LINE_CHANNELS, type LineChannel } from "@/db/schema/enums"

/** Phase-1 channelGroup keys (API filter / dimension values). */
export const CHANNEL_GROUPS = [
  "Broadcast",
  "Print",
  "OOH",
  "Digital Direct",
  "Programmatic",
  "Search",
  "Social",
  "Content",
  "Production",
] as const

export type ChannelGroup = (typeof CHANNEL_GROUPS)[number]

/** Every `line_channel` → one group. Unknown → Production (last-resort bucket). */
export const CHANNEL_TO_GROUP: Record<LineChannel, ChannelGroup> = {
  television: "Broadcast",
  radio: "Broadcast",
  cinema: "Broadcast",
  newspaper: "Print",
  magazines: "Print",
  ooh: "OOH",
  prog_ooh: "OOH",
  digi_display: "Digital Direct",
  digi_video: "Digital Direct",
  digi_audio: "Digital Direct",
  digi_bvod: "Digital Direct",
  prog_display: "Programmatic",
  prog_video: "Programmatic",
  prog_audio: "Programmatic",
  prog_bvod: "Programmatic",
  search: "Search",
  social: "Social",
  influencers: "Content",
  integrations: "Content",
  production: "Production",
}

/** Exhaustiveness: every enum member must appear in the map. */
for (const ch of LINE_CHANNELS) {
  if (!(ch in CHANNEL_TO_GROUP)) {
    throw new Error(`channelGroups: missing mapping for line_channel ${ch}`)
  }
}

export function channelGroupFor(channel: string | null | undefined): ChannelGroup {
  if (channel && channel in CHANNEL_TO_GROUP) {
    return CHANNEL_TO_GROUP[channel as LineChannel]
  }
  return "Production"
}

/** SQL CASE expression mapping `li.channel::text` → channelGroup label. */
export function channelGroupSqlCase(channelExpr = "li.channel::text"): string {
  const whens = (Object.entries(CHANNEL_TO_GROUP) as [LineChannel, ChannelGroup][])
    .map(([ch, group]) => `WHEN '${ch}' THEN '${group.replace(/'/g, "''")}'`)
    .join("\n    ")
  return `CASE ${channelExpr}\n    ${whens}\n    ELSE 'Production'\n  END`
}
