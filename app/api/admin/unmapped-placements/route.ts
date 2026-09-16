import { NextRequest, NextResponse } from "next/server"

import { getUnmappedPlacements } from "@/lib/pacing/admin/unmappedPlacements"
import { requireRole } from "@/lib/requireRole"
import { querySnowflake } from "@/lib/snowflake/query"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(request: NextRequest) {
  const admin = await requireRole(request, ["admin"])
  if ("response" in admin) return admin.response

  try {
    const placements = await getUnmappedPlacements(querySnowflake)
    return NextResponse.json({ placements })
  } catch (err) {
    console.error("[api/admin/unmapped-placements] failed", err)
    return NextResponse.json({ error: "internal_error" }, { status: 500 })
  }
}
