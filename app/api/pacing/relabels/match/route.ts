import { NextRequest, NextResponse } from "next/server"

import { requireRelabelAccess } from "@/lib/pacing/relabel/auth"
import {
  MatchNotFoundError,
  clientIdForMba,
  listMatchClients,
  loadMatchPayload,
} from "@/lib/pacing/relabel/match/load"
import { pacingJsonError } from "@/lib/pacing/pacingHttp"

export const dynamic = "force-dynamic"
export const maxDuration = 60

function noStore(body: unknown) {
  const res = NextResponse.json(body)
  res.headers.set("Cache-Control", "no-store, max-age=0")
  return res
}

/**
 * Relabels v2 Match tab.
 * - No params: { clients } for the client dropdown.
 * - ?client=<id> or ?mba=<mba>: { clients, payload } for that client.
 * - &fresh=1 skips the 5-minute cache (used after an apply).
 */
export async function GET(request: NextRequest) {
  const gate = await requireRelabelAccess(request)
  if (!gate.ok) return gate.response

  const params = request.nextUrl.searchParams
  const clientParam = params.get("client")?.trim() ?? ""
  const mbaParam = params.get("mba")?.trim() ?? ""
  const fresh = params.get("fresh") === "1"

  try {
    const clients = await listMatchClients()
    let clientId: number | null = null
    if (clientParam) {
      const n = Number(clientParam)
      if (!Number.isInteger(n) || n <= 0) return pacingJsonError("client must be a positive integer", 400)
      clientId = n
    } else if (mbaParam) {
      clientId = await clientIdForMba(mbaParam)
      if (clientId == null) return pacingJsonError("no client found for that MBA", 404)
    }
    if (clientId == null) return noStore({ clients })

    const payload = await loadMatchPayload(clientId, { fresh })
    return noStore({ clients, payload })
  } catch (error) {
    if (error instanceof MatchNotFoundError) return pacingJsonError("client not found", 404)
    console.error("[relabels/match] load failed", error)
    return pacingJsonError("could not load match data", 500)
  }
}
