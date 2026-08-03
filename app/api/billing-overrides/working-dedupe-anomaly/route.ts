import { NextRequest, NextResponse } from "next/server"
import { sql } from "drizzle-orm"
import { getCurrentUser } from "@/lib/auth/getCurrentUser"
import { getDb } from "@/db"
import {
  WORKING_BILLING_CANONICAL_DEDUPE_AUDIENCE,
  WORKING_BILLING_CANONICAL_DEDUPE_KIND,
  buildWorkingBillingCanonicalDedupePayload,
  type WorkingBillingCanonicalDedupePayload,
} from "@/lib/billing/workingBillingCanonicalDedupeAnomaly"

export const dynamic = "force-dynamic"

/**
 * POST /api/billing-overrides/working-dedupe-anomaly
 * MB-30 loud guard — working merge collapsed duplicate canonical line ids.
 * Does not close MB-30; telemetry for live campaigns.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "JSON body required" }, { status: 400 })
    }

    const b = body as Record<string, unknown>
    const versionId = b.versionId
    const mbaRaw = b.mba ?? b.mba_number ?? b.mbaNumber
    const mba =
      mbaRaw != null && String(mbaRaw).trim() !== "" ? String(mbaRaw).trim() : ""
    const collapsesRaw = Array.isArray(b.collapses) ? b.collapses : []

    if (versionId == null || versionId === "") {
      return NextResponse.json({ error: "versionId is required" }, { status: 400 })
    }
    if (!mba) {
      return NextResponse.json({ error: "mba is required" }, { status: 400 })
    }
    if (collapsesRaw.length === 0) {
      return NextResponse.json({ error: "collapses required" }, { status: 400 })
    }

    const collapses: WorkingBillingCanonicalDedupePayload["collapses"] = []
    for (const row of collapsesRaw) {
      if (!row || typeof row !== "object") continue
      const r = row as Record<string, unknown>
      const mediaKey = String(r.mediaKey ?? "").trim()
      const monthYear = String(r.monthYear ?? "").trim()
      const canonicalId = String(r.canonicalId ?? "").trim()
      const keptId = String(r.keptId ?? "").trim()
      const droppedIds = Array.isArray(r.droppedIds)
        ? r.droppedIds.map((x) => String(x)).filter(Boolean)
        : []
      if (!mediaKey || !canonicalId || droppedIds.length === 0) continue
      collapses.push({ mediaKey, monthYear, canonicalId, keptId, droppedIds })
    }
    if (collapses.length === 0) {
      return NextResponse.json({ error: "collapses required" }, { status: 400 })
    }

    const templateProgBvodIds = Array.isArray(b.templateProgBvodIds)
      ? b.templateProgBvodIds.map((x) => String(x))
      : undefined

    const payload = buildWorkingBillingCanonicalDedupePayload({
      versionId: versionId as string | number,
      mba,
      collapses,
      templateProgBvodIds,
    })

    if (!process.env.DATABASE_URL?.trim()) {
      console.warn(
        "[billing-overrides/working-dedupe-anomaly] DATABASE_URL unset — logged only",
        payload
      )
      return NextResponse.json({ ok: true, persisted: false })
    }

    try {
      const db = getDb()
      await db.execute(sql`
        INSERT INTO app_notifications (audience, kind, payload)
        VALUES (
          ${WORKING_BILLING_CANONICAL_DEDUPE_AUDIENCE},
          ${WORKING_BILLING_CANONICAL_DEDUPE_KIND},
          ${JSON.stringify(payload)}::jsonb
        )
      `)
    } catch (err) {
      console.warn(
        "[billing-overrides/working-dedupe-anomaly] failed to persist app_notifications row",
        { versionId: payload.versionId, mba: payload.mba, err }
      )
      return NextResponse.json(
        { error: "Failed to persist notification" },
        { status: 500 }
      )
    }

    return NextResponse.json({ ok: true, persisted: true })
  } catch (error) {
    console.error("[api/billing-overrides/working-dedupe-anomaly POST]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
