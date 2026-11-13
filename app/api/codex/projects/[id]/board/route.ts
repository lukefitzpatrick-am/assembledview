import { NextResponse } from "next/server"

import { isCodexProjectsEnabled } from "@/lib/codex/flag"
import { parseCompletedParam } from "@/lib/codex/projectBoard"
import { parseId } from "@/lib/codex/projects"
import { loadProjectBoard } from "@/lib/codex/projectsRepo"
import { codexFlagGuard, jsonError, requireCodexInternalAccess, sessionEmail } from "../../../_shared"
import { projectFailureResponse, projectsErrorResponse } from "../../_gate"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ id: string }> }

/**
 * GET (B39): the project board. Sections in order, the first page of cards
 * in each (`per_section`, default 50), per-section counts. `?completed=hide`
 * or `show` overrides the viewer's stored setting (then hide). A private
 * project not yours is 404.
 */
export async function GET(request: Request, context: RouteContext) {
  const flag = await codexFlagGuard()
  if (flag) return flag
  if (!(await isCodexProjectsEnabled())) return jsonError(404, "not_found")
  const auth = await requireCodexInternalAccess(request)
  if ("error" in auth) return auth.error
  const email = sessionEmail(auth.session)
  if (!email) return jsonError(401, "unauthorised")
  const id = parseId((await context.params).id)
  if (id == null) return jsonError(404, "not_found")
  const params = new URL(request.url).searchParams
  const rawCompleted = params.get("completed")
  const hideCompleted = parseCompletedParam(rawCompleted)
  if (rawCompleted != null && rawCompleted !== "" && hideCompleted == null) {
    return jsonError(400, "invalid_completed", "completed must be hide or show.")
  }
  const rawPer = params.get("per_section")
  const perSection = rawPer ? parseId(rawPer) : null
  if (rawPer && perSection == null) return jsonError(400, "invalid_per_section", "per_section must be a whole number from 1.")
  try {
    const result = await loadProjectBoard(id, email, { hideCompleted, perSection: perSection ?? undefined })
    if (!result.ok) return projectFailureResponse(result)
    const { ok: _ok, ...body } = result
    return NextResponse.json(body)
  } catch (error) {
    return projectsErrorResponse(error, "board")
  }
}
