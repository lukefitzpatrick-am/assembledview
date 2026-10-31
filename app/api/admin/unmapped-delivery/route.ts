import { NextRequest, NextResponse } from "next/server"

import { isFeatureOn } from "@/lib/features/server"
import { getUnmappedDelivery } from "@/lib/pacing/admin/unmappedDelivery"
import { requireRole } from "@/lib/requireRole"
import { querySnowflake } from "@/lib/snowflake/query"

export const dynamic = "force-dynamic"
export const maxDuration = 60

/** Read-only: last 30 days of delivery on no published line, every warehouse channel. Admins only. */
export async function GET(request: NextRequest) {
  const admin = await requireRole(request, ["admin"])
  if ("response" in admin) return admin.response
  if (!(await isFeatureOn("unmapped_delivery"))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }

  try {
    const result = await getUnmappedDelivery(querySnowflake)
    return NextResponse.json(result)
  } catch (err) {
    console.error("[api/admin/unmapped-delivery] failed", err)
    return NextResponse.json({ error: "internal_error" }, { status: 500 })
  }
}
