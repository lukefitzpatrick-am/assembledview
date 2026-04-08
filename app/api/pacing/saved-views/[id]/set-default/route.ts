import { NextRequest } from "next/server"
import { PACING_SAVED_VIEWS_PATH, xanoPacingPost } from "@/lib/xano/pacingXanoApi"
import { requirePacingAccess } from "@/lib/pacing/pacingAuth"
import { pacingJsonError, pacingJsonOk } from "@/lib/pacing/pacingHttp"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requirePacingAccess(request)
  if (!gate.ok) return gate.response

  const { id } = await ctx.params
  try {
    const payload = await xanoPacingPost(`${PACING_SAVED_VIEWS_PATH}/${id}/set-default`, {})
    return pacingJsonOk(payload)
  } catch (e) {
    console.error("[api/pacing/saved-views/set-default]", e)
    return pacingJsonError(e instanceof Error ? e.message : "xano_error", 500)
  }
}
