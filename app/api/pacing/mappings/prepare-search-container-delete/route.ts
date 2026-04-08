import { NextRequest } from "next/server"
import { requirePacingAccess } from "@/lib/pacing/pacingAuth"
import { pacingJsonError, pacingJsonOk } from "@/lib/pacing/pacingHttp"
import { prepareSearchContainerDeleteForPacing } from "@/lib/pacing/syncSearchContainersToPacing"

export const dynamic = "force-dynamic"
export const revalidate = 0

/**
 * Call immediately **before** deleting a media_plan_search row from Xano.
 * Deactivates the auto-derived pacing_mappings row and updates Snowflake.
 */
export async function POST(request: NextRequest) {
  const gate = await requirePacingAccess(request)
  if (!gate.ok) return gate.response

  try {
    const body = (await request.json()) as Record<string, unknown>
    const idRaw = body.search_container_id ?? body.id
    const id = typeof idRaw === "number" ? idRaw : Number.parseInt(String(idRaw ?? ""), 10)
    if (!Number.isFinite(id)) {
      return pacingJsonError("search_container_id is required", 400)
    }

    const ok = await prepareSearchContainerDeleteForPacing(Math.floor(id), gate.allowedClientIds)
    return pacingJsonOk({ ok, deactivated: ok })
  } catch (e) {
    console.error("[api/pacing/mappings/prepare-search-container-delete]", e)
    return pacingJsonError(e instanceof Error ? e.message : "prepare_failed", 500)
  }
}
