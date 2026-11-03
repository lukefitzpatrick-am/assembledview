import { NextRequest, NextResponse } from "next/server"
import { sql } from "drizzle-orm"
import { checkClientMbaAccess } from "@/lib/auth/checkClientMbaAccess"
import { getCurrentUser } from "@/lib/auth/getCurrentUser"
import { getDb } from "@/db"
import {
  WORKING_BILLING_CANONICAL_DEDUPE_AUDIENCE,
  WORKING_BILLING_CANONICAL_DEDUPE_KIND,
  buildWorkingBillingCanonicalDedupePayload,
  type WorkingBillingCanonicalDedupePayload,
} from "@/lib/billing/workingBillingCanonicalDedupeAnomaly"
import {
  WORKING_BILLING_ALIAS_RECONCILE_KIND,
  buildWorkingBillingAliasReconcilePayload,
  type WorkingBillingAliasReconcileSource,
  type WorkingBillingAliasReconcileSummary,
} from "@/lib/billing/workingBillingAliasReconcile"

export const dynamic = "force-dynamic"

/**
 * POST /api/billing-overrides/working-dedupe-anomaly
 * MB-30 loud guard — working merge collapsed duplicate canonical line ids.
 * Does not close MB-30; telemetry for live campaigns.
 *
 * B20: a body with `kind: "working_billing_alias_reconcile"` records old-id
 * alias adoptions and placeholder skips under that kind instead (same auth
 * and tenant check).
 */

const ALIAS_SOURCES: readonly WorkingBillingAliasReconcileSource[] = ["merge", "attach", "modal_open"]

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.map((x) => String(x ?? "").trim()).filter(Boolean) : []
}

function parseAliasSummary(b: Record<string, unknown>): WorkingBillingAliasReconcileSummary {
  const aliasAdoptions: WorkingBillingAliasReconcileSummary["aliasAdoptions"] = []
  for (const row of Array.isArray(b.aliasAdoptions) ? b.aliasAdoptions : []) {
    if (!row || typeof row !== "object") continue
    const r = row as Record<string, unknown>
    const mediaKey = String(r.mediaKey ?? "").trim()
    const fromId = String(r.fromId ?? "").trim()
    const toId = String(r.toId ?? "").trim()
    if (!mediaKey || !fromId || !toId) continue
    aliasAdoptions.push({ mediaKey, fromId, toId, months: strings(r.months) })
  }
  const placeholderSkips: WorkingBillingAliasReconcileSummary["placeholderSkips"] = []
  for (const row of Array.isArray(b.placeholderSkips) ? b.placeholderSkips : []) {
    if (!row || typeof row !== "object") continue
    const r = row as Record<string, unknown>
    const mediaKey = String(r.mediaKey ?? "").trim()
    const id = String(r.id ?? "").trim()
    if (!mediaKey || !id) continue
    placeholderSkips.push({ mediaKey, id, months: strings(r.months) })
  }
  return { aliasAdoptions, placeholderSkips }
}
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
    const isAliasReconcile = b.kind === WORKING_BILLING_ALIAS_RECONCILE_KIND

    if (versionId == null || versionId === "") {
      return NextResponse.json({ error: "versionId is required" }, { status: 400 })
    }
    if (!mba) {
      return NextResponse.json({ error: "mba is required" }, { status: 400 })
    }
    if (isAliasReconcile) {
      const summary = parseAliasSummary(b)
      if (summary.aliasAdoptions.length === 0 && summary.placeholderSkips.length === 0) {
        return NextResponse.json({ error: "aliasAdoptions or placeholderSkips required" }, { status: 400 })
      }
      const sourceRaw = String(b.source ?? "").trim() as WorkingBillingAliasReconcileSource
      const source = ALIAS_SOURCES.includes(sourceRaw) ? sourceRaw : "merge"
      const access = await checkClientMbaAccess(request, mba)
      if (!access.ok) return access.response
      const payload = buildWorkingBillingAliasReconcilePayload({
        versionId: versionId as string | number,
        mba,
        source,
        summary,
      })
      return persistNotification(WORKING_BILLING_ALIAS_RECONCILE_KIND, payload)
    }
    if (collapsesRaw.length === 0) {
      return NextResponse.json({ error: "collapses required" }, { status: 400 })
    }

    const access = await checkClientMbaAccess(request, mba)
    if (!access.ok) return access.response

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

    return persistNotification(WORKING_BILLING_CANONICAL_DEDUPE_KIND, payload)
  } catch (error) {
    console.error("[api/billing-overrides/working-dedupe-anomaly POST]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

async function persistNotification(
  kind: string,
  payload: { versionId: number | string; mba: string }
): Promise<NextResponse> {
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
        ${kind},
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
}
