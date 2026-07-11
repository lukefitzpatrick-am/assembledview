import { NextRequest, NextResponse } from "next/server"
import { requireRole } from "@/lib/requireRole"
import { getCachedPlanningMeta } from "@/lib/planning/metaCache"

export const dynamic = "force-dynamic"

/**
 * GET /api/planning/meta — waves, segments, channels (+ benches), static lists.
 * Gate: admin | manager. Auth outside unstable_cache.
 */
export async function GET(request: NextRequest) {
  const gate = await requireRole(request, ["admin", "manager"])
  if ("response" in gate) return gate.response

  try {
    const meta = await getCachedPlanningMeta()
    return NextResponse.json(meta)
  } catch (err) {
    console.error("[api/planning/meta]", err)
    return NextResponse.json(
      { error: "Failed to load planning meta" },
      { status: 500 }
    )
  }
}
