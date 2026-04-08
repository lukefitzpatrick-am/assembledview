import { NextRequest } from "next/server"
import { mergeClientsFilterForQuery, requirePacingAccess } from "@/lib/pacing/pacingAuth"
import { pacingJsonError, pacingJsonOk } from "@/lib/pacing/pacingHttp"
import { fetchLineItemPacingDailyBatch } from "@/lib/pacing/pacingMart"
import type { LineItemPacingDailyPoint } from "@/lib/xano/pacing-types"

export const dynamic = "force-dynamic"
export const revalidate = 0

type BatchBody = {
  av_line_item_ids?: unknown
  days?: unknown
}

export async function POST(request: NextRequest) {
  const gate = await requirePacingAccess(request)
  if (!gate.ok) return gate.response

  let body: BatchBody
  try {
    body = (await request.json()) as BatchBody
  } catch {
    return pacingJsonError("invalid_json", 400)
  }

  const rawIds = body.av_line_item_ids
  const ids = Array.isArray(rawIds)
    ? rawIds.map((x) => String(x ?? "").trim()).filter(Boolean)
    : []

  const daysRaw = body.days
  const days = typeof daysRaw === "number" && Number.isFinite(daysRaw) ? daysRaw : 14
  const safeDays = Math.min(Math.max(Math.floor(days), 1), 366)

  if (ids.length === 0) {
    return pacingJsonOk({ data: {} as Record<string, LineItemPacingDailyPoint[]> })
  }

  const clientFilter = mergeClientsFilterForQuery(null, gate.allowedClientIds)

  try {
    const map = await fetchLineItemPacingDailyBatch({
      clientFilter,
      avLineItemIds: ids,
      days: safeDays,
    })
    const data: Record<string, LineItemPacingDailyPoint[]> = {}
    for (const [k, v] of map.entries()) {
      data[k] = v
    }
    return pacingJsonOk({ data })
  } catch (e) {
    console.error("[api/pacing/line-items/history/batch]", e)
    return pacingJsonError(e instanceof Error ? e.message : "snowflake_error", 500)
  }
}
