import { NextRequest, NextResponse } from "next/server"

import { checkClientMbaAccess } from "@/lib/auth/checkClientMbaAccess"
import { readConversionConfigForMba } from "@/lib/clients/conversionSettingsRepo"
import { getMelbourneYesterdayISO } from "@/lib/dates/melbourne"
import { rollupConversions, valueAllowed } from "@/lib/delivery/conversions/rules"
import { queryConversionRows } from "@/lib/snowflake/conversions"

export const dynamic = "force-dynamic"
export const revalidate = 0
export const runtime = "nodejs"
export const preferredRegion = ["syd1"]
export const maxDuration = 60

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

type RequestBody = {
  mbaNumber?: unknown
  lineItemIds?: unknown
  startDate?: unknown
  endDate?: unknown
}

function ids(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return Array.from(new Set(raw.map((v) => String(v ?? "").trim().toLowerCase()).filter(Boolean)))
}

/**
 * Chosen conversions per plan line and day for one MBA (CF4).
 * Off unless the client's switch is on (client_conversion_settings.enabled).
 * Days run to Melbourne yesterday at the latest, like the pacing window.
 * Client users may only ask for line ids under their MBA.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as RequestBody | null
  const mbaNumber = typeof body?.mbaNumber === "string" ? body.mbaNumber.trim() : ""
  if (!mbaNumber) {
    return NextResponse.json({ ok: false, error: "mbaNumber is required" }, { status: 400 })
  }
  const lineItemIds = ids(body?.lineItemIds)

  const access = await checkClientMbaAccess(request, mbaNumber)
  if (!access.ok) return access.response
  if (access.isClient) {
    const prefix = mbaNumber.toLowerCase()
    if (lineItemIds.some((id) => !id.startsWith(prefix))) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 })
    }
  }

  const config = await readConversionConfigForMba(mbaNumber)
  if (!config || !config.settings.enabled) {
    return NextResponse.json({ ok: true, enabled: false })
  }

  const yesterday = getMelbourneYesterdayISO()
  const startRaw = typeof body?.startDate === "string" ? body.startDate.slice(0, 10) : ""
  const endRaw = typeof body?.endDate === "string" ? body.endDate.slice(0, 10) : ""
  const startDate = ISO_DAY.test(startRaw) ? startRaw : "2026-01-01"
  const endDate = ISO_DAY.test(endRaw) && endRaw < yesterday ? endRaw : yesterday

  const events = config.events
  const trackedPlatforms = Array.from(new Set(events.map((e) => e.platform)))
  const valuePlatforms = Array.from(
    new Set(events.filter((e) => e.includeValue && valueAllowed(e)).map((e) => e.platform)),
  )
  const base = {
    ok: true,
    enabled: true,
    headline: config.settings.headline,
    showRevenue: config.settings.showRevenue,
    trackedPlatforms,
    valuePlatforms,
    throughDate: endDate,
  }
  if (lineItemIds.length === 0 || events.length === 0 || endDate < startDate) {
    return NextResponse.json({ ...base, lines: [] })
  }

  try {
    const rows = await queryConversionRows({ lineItemIds, startDate, endDate, events })
    return NextResponse.json({ ...base, lines: rollupConversions(rows, events) })
  } catch (err) {
    console.error("[pacing/conversions] query failed", {
      mbaNumber,
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ ok: false, error: "Failed to load conversions" }, { status: 500 })
  }
}
