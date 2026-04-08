import { NextRequest } from "next/server"
import {
  PACING_SAVED_VIEWS_PATH,
  xanoPacingDelete,
  xanoPacingPatch,
} from "@/lib/xano/pacingXanoApi"
import { requirePacingAccess } from "@/lib/pacing/pacingAuth"
import { pacingJsonError, pacingJsonOk } from "@/lib/pacing/pacingHttp"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requirePacingAccess(request)
  if (!gate.ok) return gate.response

  const { id } = await ctx.params
  try {
    const body = (await request.json()) as Record<string, unknown>
    const payload = await xanoPacingPatch(`${PACING_SAVED_VIEWS_PATH}/${id}`, body)
    return pacingJsonOk(payload)
  } catch (e) {
    console.error("[api/pacing/saved-views/id PATCH]", e)
    return pacingJsonError(e instanceof Error ? e.message : "xano_error", 500)
  }
}

export async function DELETE(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requirePacingAccess(request)
  if (!gate.ok) return gate.response

  const { id } = await ctx.params
  try {
    await xanoPacingDelete(`${PACING_SAVED_VIEWS_PATH}/${id}`)
    return pacingJsonOk({ ok: true })
  } catch (e) {
    console.error("[api/pacing/saved-views/id DELETE]", e)
    return pacingJsonError(e instanceof Error ? e.message : "xano_error", 500)
  }
}
