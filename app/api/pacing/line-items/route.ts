import { NextRequest } from "next/server"
import {
  assertClientsIdsAllowed,
  mergeClientsFilterForIdList,
  parseClientsIdsParam,
  requirePacingAccess,
} from "@/lib/pacing/pacingAuth"
import { pacingJsonError, pacingJsonOk } from "@/lib/pacing/pacingHttp"
import { fetchLineItemPacingRows } from "@/lib/pacing/pacingMart"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(request: NextRequest) {
  const gate = await requirePacingAccess(request)
  if (!gate.ok) return gate.response

  const sp = request.nextUrl.searchParams
  const clientIdsList = parseClientsIdsParam(sp.get("clients_id"))

  if (clientIdsList && clientIdsList.length > 0) {
    const forbiddenMulti = assertClientsIdsAllowed(clientIdsList, gate.allowedClientIds)
    if (forbiddenMulti) return forbiddenMulti
  }

  const clientFilter = mergeClientsFilterForIdList(clientIdsList, gate.allowedClientIds)

  const mediaMulti = sp.get("media_type")?.split(",").map((s) => s.trim()).filter(Boolean) ?? []
  const statusMulti = sp.get("status")?.split(",").map((s) => s.trim()).filter(Boolean) ?? []

  try {
    const mpRaw = sp.get("media_plan_id")
    const mediaPlanId =
      mpRaw && mpRaw.trim() ? Number.parseInt(mpRaw.trim(), 10) : null

    const rows = await fetchLineItemPacingRows({
      clientFilter,
      mediaTypes: mediaMulti.length ? mediaMulti : null,
      mediaType: mediaMulti.length ? null : sp.get("media_type"),
      statuses: statusMulti.length ? statusMulti : null,
      status: statusMulti.length ? null : sp.get("status"),
      dateFrom: sp.get("date_from"),
      dateTo: sp.get("date_to"),
      search: sp.get("search"),
      mediaPlanId: mediaPlanId !== null && Number.isFinite(mediaPlanId) ? mediaPlanId : null,
    })
    return pacingJsonOk({ data: rows })
  } catch (e) {
    console.error("[api/pacing/line-items]", e)
    return pacingJsonError(e instanceof Error ? e.message : "snowflake_error", 500)
  }
}
