import { NextRequest } from "next/server"
import {
  parsePacingList,
  PACING_THRESHOLDS_PATH,
  xanoPacingGet,
  xanoPacingPatch,
} from "@/lib/xano/pacingXanoApi"
import {
  assertClientsIdAllowed,
  parseClientsIdQuery,
  requirePacingAccess,
} from "@/lib/pacing/pacingAuth"
import { pacingJsonError, pacingJsonOk } from "@/lib/pacing/pacingHttp"
import type { PacingThreshold } from "@/lib/xano/pacing-types"

export const dynamic = "force-dynamic"
export const revalidate = 0

function filterThresholds(rows: PacingThreshold[], allowedClientIds: number[] | null): PacingThreshold[] {
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
  if (clientsId !== null) params.clients_id = String(clientsId)

  try {
    const raw = await xanoPacingGet(PACING_THRESHOLDS_PATH, params)
    const list = parsePacingList(raw) as PacingThreshold[]
    const scoped = filterThresholds(list, gate.allowedClientIds)
    return pacingJsonOk({ data: scoped })
  } catch (e) {
    console.error("[api/pacing/thresholds GET]", e)
    return pacingJsonError(e instanceof Error ? e.message : "xano_error", 500)
  }
}

export async function PATCH(request: NextRequest) {
  const gate = await requirePacingAccess(request)
  if (!gate.ok) return gate.response

  try {
    const body = (await request.json()) as Record<string, unknown>
    const cidRaw = body.clients_id
    const cid =
      typeof cidRaw === "number" ? cidRaw : Number.parseInt(String(cidRaw ?? ""), 10)
    const cidNorm = Number.isFinite(cid) ? cid : null
    if (cidNorm === null) {
      return pacingJsonError("clients_id is required", 400)
    }
    const forbidden = assertClientsIdAllowed(cidNorm, gate.allowedClientIds)
    if (forbidden) return forbidden

    const payload = await xanoPacingPatch(PACING_THRESHOLDS_PATH, body as Record<string, unknown>)
    return pacingJsonOk(payload)
  } catch (e) {
    console.error("[api/pacing/thresholds PATCH]", e)
    return pacingJsonError(e instanceof Error ? e.message : "xano_error", 500)
  }
}
