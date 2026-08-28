import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { isXanoMirrorEnabled } from "@/lib/data/backend"
import { retryMirrorFromPostgres } from "@/lib/data/mirrorToXano"
import { requireAdmin } from "@/lib/requireRole"

export const dynamic = "force-dynamic"
export const revalidate = 0
export const maxDuration = 60

const bodySchema = z.object({
  mbaNumber: z.string().min(1),
  versionNumber: z.number().int().positive(),
})

/**
 * POST /api/admin/xano-mirror/retry — re-mirror a Postgres mba+version to Xano.
 * Admin-gated. Postgres remains authoritative; this only repairs the mirror.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)
  if ("response" in auth) return auth.response

  if (!isXanoMirrorEnabled()) {
    return NextResponse.json({ error: "XANO_MIRROR_DISABLED" }, { status: 409 })
  }

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const { mbaNumber, versionNumber } = parsed.data
  const result = await retryMirrorFromPostgres(mbaNumber, versionNumber)

  return NextResponse.json({
    mirror: result.mirror,
    durationMs: result.durationMs,
    xanoVersionId: result.xanoVersionId,
    ...(result.error ? { error: result.error } : {}),
  })
}
