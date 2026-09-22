/** Client-reachable — see the boundary note in `./types`. No db/snowflake here. */
import type { ChannelTabKey } from "@/lib/pacing/channel/lineCardTypes"
import { isSocialMediaType } from "@/lib/pacing/social-channels"
import { normalizeDailyFactDate } from "@/lib/snowflake/normalizeDate"
import {
  CM360_PACING_CHANNEL,
  PACING_FACT,
  SEARCH_PACING_CHANNELS,
  SEARCH_PACING_FACT,
  SOCIAL_PACING_FACT,
  type RelabelFactRoute,
} from "./types"

export { CM360_PACING_CHANNEL, SEARCH_PACING_CHANNELS }

export function normalizeLineItemId(value: string | null | undefined): string {
  return String(value ?? "").toLowerCase().trim()
}

export function factRouteForChannel(channel: string): RelabelFactRoute {
  const c = String(channel ?? "").trim()
  if (isSocialMediaType(c)) {
    return {
      table: SOCIAL_PACING_FACT,
      primaryKey: "platform_line_item_id",
      fallbackKey: null,
      updateLineItemName: true,
    }
  }
  if ((SEARCH_PACING_CHANNELS as readonly string[]).includes(c)) {
    return {
      table: SEARCH_PACING_FACT,
      primaryKey: "platform_line_item_id",
      fallbackKey: null,
      updateLineItemName: false,
    }
  }
  return {
    table: PACING_FACT,
    primaryKey: "line_item_name",
    fallbackKey: "platform_line_item_id",
    updateLineItemName: false,
  }
}

/** Card taxonomy: Snowflake CHANNEL → ChannelTabKey. */
export function cardChannelFromWarehouse(channel: string): ChannelTabKey {
  const c = String(channel ?? "").trim().toLowerCase()
  if (
    (SEARCH_PACING_CHANNELS as readonly string[]).some((name) => name.toLowerCase() === c) ||
    /\bsearch\b|\bshopping\b|\bpmax\b|\bp-?max\b/.test(c)
  ) {
    return "search"
  }
  if (isSocialMediaType(channel)) return "social"
  if (/ad serving|cm360|channel factory/.test(c)) return "ad-serving"
  if (/programmatic/.test(c)) return "programmatic"
  return "direct"
}

/** Card taxonomy: plan `line_channel` → ChannelTabKey. */
export function cardChannelFromPlanLine(lineChannel: string): ChannelTabKey {
  const c = String(lineChannel ?? "").trim().toLowerCase()
  if (c === "search") return "search"
  if (c === "social") return "social"
  if (c.startsWith("prog_")) return "programmatic"
  if (c.startsWith("digi_")) return "ad-serving"
  return "direct"
}

export function isCm360Channel(channel: string): boolean {
  return String(channel ?? "").trim().toLowerCase() === CM360_PACING_CHANNEL.toLowerCase()
}

export function asIsoDate(value: unknown): string {
  return normalizeDailyFactDate(value) ?? ""
}
