import { NextRequest } from "next/server"
import {
  parsePacingList,
  PACING_MAPPINGS_PATH,
  xanoPacingGet,
  xanoPacingGetMappingById,
  xanoPacingPost,
} from "@/lib/xano/pacingXanoApi"
import {
  coercePacingMapping,
  upsertMappingAndRefreshFact,
} from "@/lib/snowflake/pacing-mapping-sync"
import {
  assertClientsIdAllowed,
  parseClientsIdQuery,
  requirePacingAccess,
} from "@/lib/pacing/pacingAuth"
import { pacingJsonError, pacingJsonOk } from "@/lib/pacing/pacingHttp"
import type { PacingMapping } from "@/lib/xano/pacing-types"

export const dynamic = "force-dynamic"
export const revalidate = 0

function filterMappingsByScope(rows: PacingMapping[], allowedClientIds: number[] | null): PacingMapping[] {
  if (allowedClientIds === null) return rows
  const set = new Set(allowedClientIds)
  return rows.filter((r) => set.has(Number(r.clients_id)))
}

export async function GET(request: NextRequest) {
  const gate = await requirePacingAccess(request)
  if (!gate.ok) return gate.response

  const sp = request.nextUrl.searchParams
  const clientsId = parseClientsIdQuery(sp.get("clients_id"))
  const forbidden = assertClientsIdAllowed(clientsId, gate.allowedClientIds)
  if (forbidden) return forbidden

  const params: Record<string, unknown> = {}
  const qClients = sp.get("clients_id")
  const qMedia = sp.get("media_type")
  const qPlat = sp.get("platform")
  const qActive = sp.get("is_active")
  if (qClients) params.clients_id = qClients
  if (qMedia) params.media_type = qMedia
  if (qPlat) params.platform = qPlat
  if (qActive !== null && qActive !== "") params.is_active = qActive

  try {
    const raw = await xanoPacingGet(PACING_MAPPINGS_PATH, params)
    const list = parsePacingList(raw) as PacingMapping[]
    return pacingJsonOk({ data: filterMappingsByScope(list, gate.allowedClientIds) })
  } catch (e) {
    console.error("[api/pacing/mappings GET]", e)
    return pacingJsonError(e instanceof Error ? e.message : "xano_error", 500)
  }
}

export async function POST(request: NextRequest) {
  const gate = await requirePacingAccess(request)
  if (!gate.ok) return gate.response

  try {
    const body = (await request.json()) as Record<string, unknown>
    const cid =
      typeof body.clients_id === "number"
        ? body.clients_id
        : Number.parseInt(String(body.clients_id ?? ""), 10)
    const cidNorm = Number.isFinite(cid) ? cid : null
    const forbidden = assertClientsIdAllowed(cidNorm, gate.allowedClientIds)
    if (forbidden) return forbidden
    if (cidNorm === null) {
      return pacingJsonError("clients_id is required", 400)
    }

    const payload = await xanoPacingPost(PACING_MAPPINGS_PATH, body)
    let mapping = coercePacingMapping(payload)
    if (!mapping) {
      const maybeId = (payload as Record<string, unknown>)?.id
      const idNum = typeof maybeId === "number" ? maybeId : Number(maybeId)
      if (Number.isFinite(idNum)) {
        mapping = coercePacingMapping(await xanoPacingGetMappingById(idNum))
      }
    }
    if (mapping) {
      try {
        await upsertMappingAndRefreshFact(mapping)
      } catch (sfErr) {
        console.error("[api/pacing/mappings POST] snowflake_sync_failed", sfErr)
        return pacingJsonError(
          sfErr instanceof Error ? sfErr.message : "snowflake_sync_failed",
          502,
          { xano_ok: true, hint: "Row may be saved in Xano; use Resync or webhook retry." }
        )
      }
    }
    return pacingJsonOk(payload, { status: 201 })
  } catch (e) {
    console.error("[api/pacing/mappings POST]", e)
    return pacingJsonError(e instanceof Error ? e.message : "xano_error", 500)
  }
}
