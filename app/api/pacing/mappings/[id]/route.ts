import { NextRequest } from "next/server"
import {
  PACING_MAPPINGS_PATH,
  xanoPacingDelete,
  xanoPacingGet,
  xanoPacingGetMappingById,
  xanoPacingPatch,
} from "@/lib/xano/pacingXanoApi"
import {
  coercePacingMapping,
  softDeleteMappingAndRefreshFact,
  upsertMappingAndRefreshFact,
} from "@/lib/snowflake/pacing-mapping-sync"
import { assertClientsIdAllowed, requirePacingAccess } from "@/lib/pacing/pacingAuth"
import { pacingJsonError, pacingJsonOk } from "@/lib/pacing/pacingHttp"
import type { PacingMapping } from "@/lib/xano/pacing-types"

export const dynamic = "force-dynamic"
export const revalidate = 0

async function loadMapping(id: number): Promise<PacingMapping | null> {
  try {
    const raw = await xanoPacingGet(`${PACING_MAPPINGS_PATH}/${id}`)
    if (raw && typeof raw === "object") {
      const o = raw as Record<string, unknown>
      if (o.data && typeof o.data === "object") return o.data as PacingMapping
      return raw as PacingMapping
    }
  } catch {
    return null
  }
  return null
}

export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requirePacingAccess(_request)
  if (!gate.ok) return gate.response

  const { id: idRaw } = await ctx.params
  const id = Number.parseInt(idRaw, 10)
  if (!Number.isFinite(id)) {
    return pacingJsonError("invalid id", 400)
  }

  try {
    const row = await loadMapping(id)
    if (!row) {
      return pacingJsonError("not_found", 404)
    }
    const forbidden = assertClientsIdAllowed(Number(row.clients_id), gate.allowedClientIds)
    if (forbidden) return forbidden
    return pacingJsonOk({ data: row })
  } catch (e) {
    console.error("[api/pacing/mappings/id GET]", e)
    return pacingJsonError(e instanceof Error ? e.message : "xano_error", 500)
  }
}

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requirePacingAccess(request)
  if (!gate.ok) return gate.response

  const { id: idRaw } = await ctx.params
  const id = Number.parseInt(idRaw, 10)
  if (!Number.isFinite(id)) {
    return pacingJsonError("invalid id", 400)
  }

  const existing = await loadMapping(id)
  if (!existing) {
    return pacingJsonError("not_found", 404)
  }
  const forbiddenExisting = assertClientsIdAllowed(Number(existing.clients_id), gate.allowedClientIds)
  if (forbiddenExisting) return forbiddenExisting

  try {
    const body = (await request.json()) as Record<string, unknown>
    if (body.clients_id !== undefined) {
      const target = Number(body.clients_id)
      const forbidden = assertClientsIdAllowed(target, gate.allowedClientIds)
      if (forbidden) return forbidden
    }
    await xanoPacingPatch(`${PACING_MAPPINGS_PATH}/${id}`, body)
    const mapping = coercePacingMapping(await xanoPacingGetMappingById(id))
    if (mapping) {
      try {
        await upsertMappingAndRefreshFact(mapping)
      } catch (sfErr) {
        console.error("[api/pacing/mappings/id PATCH] snowflake_sync_failed", sfErr)
        return pacingJsonError(
          sfErr instanceof Error ? sfErr.message : "snowflake_sync_failed",
          502,
          { xano_ok: true }
        )
      }
    }
    return pacingJsonOk({ data: mapping ?? null })
  } catch (e) {
    console.error("[api/pacing/mappings/id PATCH]", e)
    return pacingJsonError(e instanceof Error ? e.message : "xano_error", 500)
  }
}

export async function DELETE(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requirePacingAccess(request)
  if (!gate.ok) return gate.response

  const { id: idRaw } = await ctx.params
  const id = Number.parseInt(idRaw, 10)
  if (!Number.isFinite(id)) {
    return pacingJsonError("invalid id", 400)
  }

  const existing = await loadMapping(id)
  if (!existing) {
    return pacingJsonError("not_found", 404)
  }
  const forbiddenExisting = assertClientsIdAllowed(Number(existing.clients_id), gate.allowedClientIds)
  if (forbiddenExisting) return forbiddenExisting

  try {
    await xanoPacingDelete(`${PACING_MAPPINGS_PATH}/${id}`)
    try {
      await softDeleteMappingAndRefreshFact(id)
    } catch (sfErr) {
      console.error("[api/pacing/mappings/id DELETE] snowflake_sync_failed", sfErr)
      return pacingJsonError(
        sfErr instanceof Error ? sfErr.message : "snowflake_sync_failed",
        502,
        { xano_ok: true }
      )
    }
    return pacingJsonOk({ ok: true })
  } catch (e) {
    console.error("[api/pacing/mappings/id DELETE]", e)
    return pacingJsonError(e instanceof Error ? e.message : "xano_error", 500)
  }
}
