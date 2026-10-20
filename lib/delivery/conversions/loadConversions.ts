import "server-only"

import { getMelbourneYesterdayISO } from "@/lib/dates/melbourne"
import { rollupConversions, valueAllowed } from "@/lib/delivery/conversions/rules"
import type { LoadedConversions } from "@/lib/delivery/conversions/channelConversions"
import type { readConversionConfigForMba } from "@/lib/clients/conversionSettingsRepo"
import type { queryConversionRows } from "@/lib/snowflake/conversions"

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

export type LoadConversionsDeps = {
  readConfig?: typeof readConversionConfigForMba
  query?: typeof queryConversionRows
  yesterdayISO?: () => string
}

/**
 * Server read of a campaign's chosen conversions for a window (CF5).
 * Same rules as /api/pacing/conversions: null when the client's switch is
 * off (no Snowflake read), days stop at Melbourne yesterday, only chosen
 * events, CM360 beats DV360 on a line. Callers do their own access checks.
 * Throws when Snowflake fails so callers can say "unavailable" rather than 0.
 */
export async function loadConversionsForLines(
  input: {
    mbaNumber: string
    lineItemIds: readonly string[]
    startDate: string
    endDate: string
    /** Settings only; no Snowflake read (a window that has not opened). */
    skipRead?: boolean
  },
  deps: LoadConversionsDeps = {},
): Promise<LoadedConversions | null> {
  const mbaNumber = input.mbaNumber.trim()
  if (!mbaNumber) return null
  // Loaded on use so importing the deck or Ava modules never opens a DB client.
  const readConfig =
    deps.readConfig ?? (await import("@/lib/clients/conversionSettingsRepo")).readConversionConfigForMba
  const config = await readConfig(mbaNumber)
  if (!config || !config.settings.enabled) return null

  const yesterday = (deps.yesterdayISO ?? (() => getMelbourneYesterdayISO()))()
  const startRaw = String(input.startDate ?? "").slice(0, 10)
  const endRaw = String(input.endDate ?? "").slice(0, 10)
  const startDate = ISO_DAY.test(startRaw) ? startRaw : "2026-01-01"
  const endDate = ISO_DAY.test(endRaw) && endRaw < yesterday ? endRaw : yesterday

  const events = config.events
  const base: LoadedConversions = {
    headline: config.settings.headline,
    showRevenue: config.settings.showRevenue,
    trackedPlatforms: Array.from(new Set(events.map((e) => e.platform))),
    valuePlatforms: Array.from(
      new Set(events.filter((e) => e.includeValue && valueAllowed(e)).map((e) => e.platform)),
    ),
    throughDate: endDate,
    lines: [],
  }
  const ids = Array.from(
    new Set(input.lineItemIds.map((id) => String(id ?? "").trim().toLowerCase()).filter(Boolean)),
  )
  if (input.skipRead || ids.length === 0 || events.length === 0 || endDate < startDate) return base

  const query = deps.query ?? (await import("@/lib/snowflake/conversions")).queryConversionRows
  const rows = await query({ lineItemIds: ids, startDate, endDate, events })
  return { ...base, lines: rollupConversions(rows, events) }
}
