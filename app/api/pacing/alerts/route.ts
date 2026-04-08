import { NextRequest } from "next/server"
import {
  assertClientsIdsAllowed,
  mergeClientsFilterForIdList,
  parseClientsIdsParam,
  requirePacingAccess,
} from "@/lib/pacing/pacingAuth"
import { pacingJsonError, pacingJsonOk } from "@/lib/pacing/pacingHttp"
import { fetchPacingAlerts } from "@/lib/pacing/pacingMart"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(request: NextRequest) {
  const gate = await requirePacingAccess(request)
  if (!gate.ok) return gate.response

  const sp = request.nextUrl.searchParams
  const clientIdsList = parseClientsIdsParam(sp.get("clients_id"))
  if (clientIdsList && clientIdsList.length > 0) {
    const forbidden = assertClientsIdsAllowed(clientIdsList, gate.allowedClientIds)
    if (forbidden) return forbidden
  }
  const clientFilter = mergeClientsFilterForIdList(clientIdsList, gate.allowedClientIds)

  const mediaMulti = sp.get("media_type")?.split(",").map((s) => s.trim()).filter(Boolean) ?? []

  try {
    const data = await fetchPacingAlerts({
      clientFilter,
      severity: sp.get("severity"),
      mediaTypes: mediaMulti.length ? mediaMulti : null,
      mediaType: mediaMulti.length ? null : sp.get("media_type"),
    })
    return pacingJsonOk({ data })
  } catch (e) {
    console.error("[api/pacing/alerts]", e)
    return pacingJsonError(e instanceof Error ? e.message : "snowflake_error", 500)
  }
}
