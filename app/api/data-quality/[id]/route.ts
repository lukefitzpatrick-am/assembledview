import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { closeDataQualityItem } from "@/lib/dataQuality/items.server"
import { isFeatureOn } from "@/lib/features/server"
import { requireRole } from "@/lib/requireRole"

export const dynamic = "force-dynamic"

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("resolve") }),
  z.object({ action: z.literal("dismiss"), reason: z.string().trim().min(1).max(1000) }),
])

/**
 * S17: resolve or dismiss (with a reason) one open Data quality item. Staff
 * only (`admin`, unscoped); a client gets 403. Switch off: 404. An id with no
 * open item: 404.
 */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const admin = await requireRole(request, ["admin"])
  if ("response" in admin) return admin.response
  if (!(await isFeatureOn("data_quality_queue"))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }
  const actorEmail = typeof admin.session?.user?.email === "string" ? admin.session.user.email.trim() : ""
  if (!actorEmail) return NextResponse.json({ error: "unauthorised" }, { status: 401 })

  const { id: rawId } = await context.params
  const id = Number(rawId)
  if (!Number.isSafeInteger(id) || id <= 0) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 })
  }
  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", fieldErrors: parsed.error.flatten().fieldErrors }, { status: 400 })
  }
  try {
    if (!(await closeDataQualityItem(id, parsed.data, actorEmail))) {
      return NextResponse.json({ error: "not_found" }, { status: 404 })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[api/data-quality] close failed", err)
    return NextResponse.json({ error: "internal_error" }, { status: 500 })
  }
}
