import { NextRequest, NextResponse } from "next/server"
import { sql } from "drizzle-orm"
import { checkClientMbaAccess } from "@/lib/auth/checkClientMbaAccess"
import { getCurrentUser } from "@/lib/auth/getCurrentUser"
import { getDb } from "@/db"
import {
  BILLING_OVERRIDES_REFETCH_ANOMALY_AUDIENCE,
  BILLING_OVERRIDES_REFETCH_ANOMALY_KIND,
  buildBillingOverridesRefetchAnomalyPayload,
  type BillingOverridesRefetchAnomalyReason,
} from "@/lib/billing/postPersistOverrideRefetchAnomaly"

export const dynamic = "force-dynamic"

const ALLOWED_REASONS = new Set<BillingOverridesRefetchAnomalyReason>([
  "empty_after_persist",
  "refetch_threw",
])

/**
 * POST /api/billing-overrides/refetch-anomaly
 * MB-14 — durable audit when persist succeeded but post-save refetch was empty
 * or threw. Shape mirrors xano_client_mirror_failed (audience + kind + payload).
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
    const reason = String(b.reason ?? "") as BillingOverridesRefetchAnomalyReason

    if (versionId == null || versionId === "") {
      return NextResponse.json({ error: "versionId is required" }, { status: 400 })
    }
    if (!mba) {
      return NextResponse.json({ error: "mba is required" }, { status: 400 })
    }
    if (!ALLOWED_REASONS.has(reason)) {
      return NextResponse.json(
        { error: "reason must be empty_after_persist or refetch_threw" },
        { status: 400 }
      )
    }

    const access = await checkClientMbaAccess(request, mba)
    if (!access.ok) return access.response

    const payload = buildBillingOverridesRefetchAnomalyPayload({
      versionId: versionId as string | number,
      mba,
      reason,
      replacedMedia: Number(b.replacedMedia ?? 0) || 0,
      replacedFee: Number(b.replacedFee ?? 0) || 0,
      reset: Number(b.reset ?? 0) || 0,
      refetchRowCount:
        b.refetchRowCount != null ? Number(b.refetchRowCount) || 0 : undefined,
      error: typeof b.error === "string" ? b.error : undefined,
      retainedPriorMeta: b.retainedPriorMeta !== false,
    })

    if (!process.env.DATABASE_URL?.trim()) {
      console.warn(
        "[billing-overrides/refetch-anomaly] DATABASE_URL unset — logged only",
        payload
      )
      return NextResponse.json({ ok: true, persisted: false })
    }

    try {
      const db = getDb()
      await db.execute(sql`
        INSERT INTO app_notifications (audience, kind, payload)
        VALUES (
          ${BILLING_OVERRIDES_REFETCH_ANOMALY_AUDIENCE},
          ${BILLING_OVERRIDES_REFETCH_ANOMALY_KIND},
          ${JSON.stringify(payload)}::jsonb
        )
      `)
    } catch (err) {
      console.warn(
        "[billing-overrides/refetch-anomaly] failed to persist app_notifications row",
        { versionId: payload.versionId, mba: payload.mba, err }
      )
      return NextResponse.json(
        { error: "Failed to persist notification" },
        { status: 500 }
      )
    }

    return NextResponse.json({ ok: true, persisted: true })
  } catch (error) {
    console.error("[api/billing-overrides/refetch-anomaly POST]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
