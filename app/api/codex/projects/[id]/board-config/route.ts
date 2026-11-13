import { NextResponse } from "next/server"

import { isCodexProjectsEnabled } from "@/lib/codex/flag"
import { parseId } from "@/lib/codex/projects"
import { setBoardHideCompleted } from "@/lib/codex/projectsRepo"
import { codexFlagGuard, jsonError, requireCodexInternalAccess, sessionEmail } from "../../../_shared"
import { projectFailureResponse, projectsErrorResponse } from "../../_gate"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ id: string }> }

/** PUT `{ hide_completed }` (B39): the viewer's hide or show completed setting for this project board. */
export async function PUT(request: Request, context: RouteContext) {
  const flag = await codexFlagGuard()
  if (flag) return flag
  if (!(await isCodexProjectsEnabled())) return jsonError(404, "not_found")
  const auth = await requireCodexInternalAccess(request)
  if ("error" in auth) return auth.error
  const email = sessionEmail(auth.session)
  if (!email) return jsonError(401, "unauthorised")
  const id = parseId((await context.params).id)
  if (id == null) return jsonError(404, "not_found")
  const body = (await request.json().catch(() => null)) as { hide_completed?: unknown } | null
  if (!body || typeof body.hide_completed !== "boolean") {
    return jsonError(400, "invalid_hide_completed", "hide_completed must be true or false.")
  }
  try {
    const result = await setBoardHideCompleted(id, email, body.hide_completed)
    if (!result.ok) return projectFailureResponse(result)
    return NextResponse.json({ hide_completed: result.hide_completed })
  } catch (error) {
    return projectsErrorResponse(error, "board config")
  }
}
