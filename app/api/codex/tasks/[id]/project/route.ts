import { NextResponse } from "next/server"

import { isCodexProjectsEnabled } from "@/lib/codex/flag"
import { parseId } from "@/lib/codex/projects"
import { getTaskProjectDetail } from "@/lib/codex/taskDetailRepo"
import { codexFlagGuard, jsonError, requireCodexInternalAccess, sessionEmail, hiddenTaskGuard } from "../../../_shared"
import { projectFailureResponse, projectsErrorResponse } from "../../../projects/_gate"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ id: string }> }

/**
 * GET (B40): the task detail's project part: project, sections, type, dates,
 * assigned by, custom fields and values, subtasks, a subtask's parent. A
 * private project the viewer cannot see comes back as `project: null`,
 * `project_hidden: true`. Behind codex_projects; 503 before 0118.
 */
export async function GET(request: Request, context: RouteContext) {
  const flag = await codexFlagGuard()
  if (flag) return flag
  if (!(await isCodexProjectsEnabled())) return jsonError(404, "not_found")
  const auth = await requireCodexInternalAccess(request)
  if ("error" in auth) return auth.error
  const hidden = await hiddenTaskGuard(context, auth.session)
  if (hidden) return hidden
  const email = sessionEmail(auth.session)
  if (!email) return jsonError(401, "unauthorised")
  const id = parseId((await context.params).id)
  if (id == null) return jsonError(404, "not_found")
  try {
    const result = await getTaskProjectDetail(id, email)
    if (!result.ok) return projectFailureResponse(result)
    const { ok: _ok, ...body } = result
    return NextResponse.json(body)
  } catch (error) {
    return projectsErrorResponse(error, "load task detail")
  }
}
