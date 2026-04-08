import { NextRequest } from "next/server"
import {
  parsePacingList,
  PACING_SAVED_VIEWS_PATH,
  xanoPacingGet,
  xanoPacingPost,
} from "@/lib/xano/pacingXanoApi"
import { requirePacingAccess } from "@/lib/pacing/pacingAuth"
import { pacingJsonError, pacingJsonOk } from "@/lib/pacing/pacingHttp"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(request: NextRequest) {
  const gate = await requirePacingAccess(request)
  if (!gate.ok) return gate.response

  try {
    const raw = await xanoPacingGet(PACING_SAVED_VIEWS_PATH)
    return pacingJsonOk({ data: parsePacingList(raw) })
  } catch (e) {
    console.error("[api/pacing/saved-views GET]", e)
    return pacingJsonError(e instanceof Error ? e.message : "xano_error", 500)
  }
}

export async function POST(request: NextRequest) {
  const gate = await requirePacingAccess(request)
  if (!gate.ok) return gate.response

  try {
    const body = (await request.json()) as Record<string, unknown>
    const payload = await xanoPacingPost(PACING_SAVED_VIEWS_PATH, body)
    return pacingJsonOk(payload, { status: 201 })
  } catch (e) {
    console.error("[api/pacing/saved-views POST]", e)
    return pacingJsonError(e instanceof Error ? e.message : "xano_error", 500)
  }
}
