import { NextRequest } from "next/server"
import { mergeClientsFilterForQuery, requirePacingAccess } from "@/lib/pacing/pacingAuth"
import { pacingJsonError, pacingJsonOk } from "@/lib/pacing/pacingHttp"
import { fetchLineItemPacingDaily } from "@/lib/pacing/pacingMart"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ av_line_item_id: string }> }
) {
  const gate = await requirePacingAccess(request)
  if (!gate.ok) return gate.response

  const { av_line_item_id } = await ctx.params
  if (!av_line_item_id?.trim()) {
    return pacingJsonError("av_line_item_id is required", 400, { field: "av_line_item_id" })
  }

  const daysRaw = request.nextUrl.searchParams.get("days")
  const days = daysRaw ? Number.parseInt(daysRaw, 10) : 30
  const safeDays = Number.isFinite(days) ? days : 30

  const clientFilter = mergeClientsFilterForQuery(null, gate.allowedClientIds)

  try {
    const data = await fetchLineItemPacingDaily({
      clientFilter,
      avLineItemId: decodeURIComponent(av_line_item_id),
      days: safeDays,
    })
    return pacingJsonOk({ data })
  } catch (e) {
    console.error("[api/pacing/line-items/history]", e)
    return pacingJsonError(e instanceof Error ? e.message : "snowflake_error", 500)
  }
}
