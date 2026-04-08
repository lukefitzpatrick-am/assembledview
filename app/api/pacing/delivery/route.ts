import { NextRequest } from "next/server"
import { mergeClientsFilterForQuery, requirePacingAccess } from "@/lib/pacing/pacingAuth"
import { pacingJsonError, pacingJsonOk } from "@/lib/pacing/pacingHttp"
import { fetchDeliveryPacingRows } from "@/lib/pacing/pacingMart"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(request: NextRequest) {
  const gate = await requirePacingAccess(request)
  if (!gate.ok) return gate.response

  const avLineItemId = request.nextUrl.searchParams.get("av_line_item_id")
  if (!avLineItemId?.trim()) {
    return pacingJsonError("av_line_item_id is required", 400, { field: "av_line_item_id" })
  }

  const clientFilter = mergeClientsFilterForQuery(null, gate.allowedClientIds)

  try {
    const data = await fetchDeliveryPacingRows({
      clientFilter,
      avLineItemId: avLineItemId.trim(),
      platform: request.nextUrl.searchParams.get("platform"),
      groupType: request.nextUrl.searchParams.get("group_type"),
    })
    return pacingJsonOk({ data })
  } catch (e) {
    console.error("[api/pacing/delivery]", e)
    return pacingJsonError(e instanceof Error ? e.message : "snowflake_error", 500)
  }
}
