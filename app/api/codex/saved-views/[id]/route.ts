import { NextResponse } from "next/server"
import { parseSavedViewPatch } from "@/lib/codex/savedViews"
import { deleteSavedView, updateSavedView } from "@/lib/codex/savedViewsRepo"
import { isCodexSavedViewsEnabled } from "@/lib/codex/flag"
import { codexFlagGuard, jsonError, requireCodexInternalAccess, sessionEmail } from "../../_shared"
import { savedViewId, savedViewsErrorResponse } from "../_gate"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ id: string }> }

function refused(reason: "not_found" | "not_owner"): NextResponse {
  return reason === "not_owner"
    ? jsonError(403, "not_owner", "Only the person who saved this view can change it")
    : jsonError(404, "not_found")
}

/** PATCH: rename, or share or unshare. Owner only. */
export async function PATCH(request: Request, context: RouteContext) {
  const flag = await codexFlagGuard()
  if (flag) return flag
  if (!(await isCodexSavedViewsEnabled())) return jsonError(404, "not_found")
  const auth = await requireCodexInternalAccess(request)
  if ("error" in auth) return auth.error
  const email = sessionEmail(auth.session)
  if (!email) return jsonError(401, "unauthorised")
  const id = savedViewId((await context.params).id)
  if (id == null) return jsonError(404, "not_found")
  const parsed = parseSavedViewPatch(await request.json().catch(() => null))
  if (!parsed.ok) return jsonError(400, parsed.error, parsed.message)
  try {
    const result = await updateSavedView(id, email, parsed.value)
    if (!result.ok) return refused(result.reason)
    return NextResponse.json(result.view)
  } catch (error) {
    return savedViewsErrorResponse(error, "update")
  }
}

/** DELETE: owner only. */
export async function DELETE(request: Request, context: RouteContext) {
  const flag = await codexFlagGuard()
  if (flag) return flag
  if (!(await isCodexSavedViewsEnabled())) return jsonError(404, "not_found")
  const auth = await requireCodexInternalAccess(request)
  if ("error" in auth) return auth.error
  const email = sessionEmail(auth.session)
  if (!email) return jsonError(401, "unauthorised")
  const id = savedViewId((await context.params).id)
  if (id == null) return jsonError(404, "not_found")
  try {
    const result = await deleteSavedView(id, email)
    if (!result.ok) return refused(result.reason)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return savedViewsErrorResponse(error, "delete")
  }
}
