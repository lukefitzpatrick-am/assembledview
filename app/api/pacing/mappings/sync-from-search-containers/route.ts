import { NextRequest } from "next/server"
import { assertClientsIdAllowed, requirePacingAccess } from "@/lib/pacing/pacingAuth"
import { pacingJsonError, pacingJsonOk } from "@/lib/pacing/pacingHttp"
import { syncSearchContainersToPacingMappings } from "@/lib/pacing/syncSearchContainersToPacing"
import axios from "axios"
import { xanoUrl } from "@/lib/api/xano"

export const dynamic = "force-dynamic"
export const revalidate = 0

const MEDIA_PLANS_KEYS: string[] = ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"]

async function clientsIdForVersion(versionId: number): Promise<number | null> {
  try {
    const url = xanoUrl(`media_plan_versions?id=${versionId}`, MEDIA_PLANS_KEYS)
    const res = await axios.get(url, { timeout: 15000 })
    const raw = res.data
    const row = Array.isArray(raw) ? raw[0] : raw
    if (!row || typeof row !== "object") return null
    const o = row as Record<string, unknown>
    const n = (v: unknown) => {
      if (v === undefined || v === null || v === "") return null
      const x = typeof v === "number" ? v : Number(v)
      return Number.isFinite(x) ? x : null
    }
    return n(o.clients_id) ?? n(o.client_id) ?? null
  } catch {
    return null
  }
}

export async function POST(request: NextRequest) {
  const gate = await requirePacingAccess(request)
  if (!gate.ok) return gate.response

  try {
    const body = (await request.json()) as Record<string, unknown>
    const clientsRaw = body.clients_id
    const clientsId =
      clientsRaw === undefined || clientsRaw === null
        ? null
        : Number.parseInt(String(clientsRaw), 10)
    const versionRaw = body.media_plan_version_id
    const mediaPlanVersionId =
      versionRaw === undefined || versionRaw === null
        ? null
        : Number.parseInt(String(versionRaw), 10)

    const forbidden =
      clientsId !== null && Number.isFinite(clientsId)
        ? assertClientsIdAllowed(clientsId, gate.allowedClientIds)
        : null
    if (forbidden) return forbidden

    if (mediaPlanVersionId !== null && Number.isFinite(mediaPlanVersionId)) {
      const owner = await clientsIdForVersion(Math.floor(mediaPlanVersionId))
      if (owner != null) {
        const v = assertClientsIdAllowed(owner, gate.allowedClientIds)
        if (v) return v
      }
    }

    const dryRun = body.dry_run === true || body.dry_run === "true"

    const result = await syncSearchContainersToPacingMappings({
      clientsId: clientsId !== null && Number.isFinite(clientsId) ? clientsId : null,
      mediaPlanVersionId:
        mediaPlanVersionId !== null && Number.isFinite(mediaPlanVersionId)
          ? Math.floor(mediaPlanVersionId)
          : null,
      allowedClientIds: gate.allowedClientIds,
      snowflake: true,
      dryRun,
    })

    return pacingJsonOk({ data: result })
  } catch (e) {
    console.error("[api/pacing/mappings/sync-from-search-containers]", e)
    return pacingJsonError(e instanceof Error ? e.message : "sync_failed", 500)
  }
}
