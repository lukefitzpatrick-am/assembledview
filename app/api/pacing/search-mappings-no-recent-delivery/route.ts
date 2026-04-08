import { NextRequest } from "next/server"
import { requirePacingAccess } from "@/lib/pacing/pacingAuth"
import { pacingJsonError, pacingJsonOk } from "@/lib/pacing/pacingHttp"
import { fetchSearchMappingsNoRecentDelivery } from "@/lib/pacing/searchMappingsNoRecentDelivery"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(request: NextRequest) {
  const gate = await requirePacingAccess(request)
  if (!gate.ok) return gate.response

  try {
    const rows = await fetchSearchMappingsNoRecentDelivery()
    return pacingJsonOk({ data: rows })
  } catch (e) {
    console.error("[api/pacing/search-mappings-no-recent-delivery]", e)
    return pacingJsonError(e instanceof Error ? e.message : "snowflake_error", 500)
  }
}
