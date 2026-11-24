import { NextRequest, NextResponse } from "next/server"

import { listOpenDataQualityItems } from "@/lib/dataQuality/items.server"
import { isFeatureOn } from "@/lib/features/server"
import { requireRole } from "@/lib/requireRole"

export const dynamic = "force-dynamic"

/**
 * S17: every open Data quality item. Staff only: `admin` is the only staff
 * role and the only unscoped one; a client (or an admin viewing as a client)
 * gets 403. Switch `data_quality_queue` off: 404.
 */
export async function GET(request: NextRequest) {
  const admin = await requireRole(request, ["admin"])
  if ("response" in admin) return admin.response
  if (!(await isFeatureOn("data_quality_queue"))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }
  try {
    return NextResponse.json({ items: await listOpenDataQualityItems() })
  } catch (err) {
    console.error("[api/data-quality] list failed", err)
    return NextResponse.json({ error: "internal_error" }, { status: 500 })
  }
}
