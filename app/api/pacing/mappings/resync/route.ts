import { NextRequest } from "next/server"
import { requireAdmin } from "@/lib/requireRole"
import { pacingJsonError, pacingJsonOk } from "@/lib/pacing/pacingHttp"
import { resyncAllAndRefreshFact } from "@/lib/snowflake/pacing-mapping-sync"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request)
  if ("response" in admin) return admin.response

  try {
    const counts = await resyncAllAndRefreshFact()
    return pacingJsonOk(counts)
  } catch (e) {
    console.error("[api/pacing/mappings/resync]", e)
    return pacingJsonError(e instanceof Error ? e.message : "resync_failed", 500)
  }
}
