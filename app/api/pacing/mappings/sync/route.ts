import { NextRequest } from "next/server"
import { pacingJsonError, pacingJsonOk } from "@/lib/pacing/pacingHttp"
import {
  coercePacingMapping,
  softDeleteMappingAndRefreshFact,
  upsertMappingAndRefreshFact,
} from "@/lib/snowflake/pacing-mapping-sync"

export const dynamic = "force-dynamic"
export const revalidate = 0

/**
 * Xano (or other workers) can call this after writes when they cannot hit Snowflake directly.
 * Set `PACING_MAPPINGS_WEBHOOK_SECRET` and send the same value in header `x-pacing-webhook-secret`.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.PACING_MAPPINGS_WEBHOOK_SECRET?.trim()
  if (!secret) {
    return pacingJsonError("webhook_not_configured", 503)
  }
  const got = request.headers.get("x-pacing-webhook-secret")?.trim()
  if (!got || got !== secret) {
    return pacingJsonError("unauthorised", 401)
  }

  try {
    const body = (await request.json()) as Record<string, unknown>
    let action = String(body.action ?? "").toLowerCase()
    if (!action && body.mapping && typeof body.mapping === "object") {
      action = "upsert"
    }

    if (action === "delete") {
      const id = Number(body.mapping_id ?? body.id)
      if (!Number.isFinite(id)) {
        return pacingJsonError("mapping_id required", 400)
      }
      await softDeleteMappingAndRefreshFact(id)
      return pacingJsonOk({ ok: true, action: "delete", mapping_id: id })
    }

    if (action === "upsert") {
      const raw = body.mapping ?? body
      const mapping = coercePacingMapping(raw)
      if (!mapping) {
        return pacingJsonError("invalid mapping payload", 400)
      }
      await upsertMappingAndRefreshFact(mapping)
      return pacingJsonOk({ ok: true, action: "upsert", mapping_id: mapping.id })
    }

    return pacingJsonError("action must be upsert or delete", 400)
  } catch (e) {
    console.error("[api/pacing/mappings/sync]", e)
    return pacingJsonError(e instanceof Error ? e.message : "sync_failed", 500)
  }
}
