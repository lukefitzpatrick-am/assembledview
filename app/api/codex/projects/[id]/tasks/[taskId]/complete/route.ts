import { NextResponse } from "next/server"

import { isCodexProjectsEnabled } from "@/lib/codex/flag"
import { parseId } from "@/lib/codex/projects"
import { completeProjectTask } from "@/lib/codex/projectsRepo"
import { codexFlagGuard, jsonError, requireCodexInternalAccess, sessionEmail } from "../../../../../_shared"
import { projectFailureResponse, projectsErrorResponse } from "../../../../_gate"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ id: string; taskId: string }> }

/** POST: complete a task of this project; it moves to the project's first done section. */
export async function POST(request: Request, context: RouteContext) {
  const flag = await codexFlagGuard()
  if (flag) return flag
  if (!(await isCodexProjectsEnabled())) return jsonError(404, "not_found")
  const auth = await requireCodexInternalAccess(request)
  if ("error" in auth) return auth.error
  const email = sessionEmail(auth.session)
  if (!email) return jsonError(401, "unauthorised")
  const params = await context.params
  const id = parseId(params.id)
  const taskId = parseId(params.taskId)
  if (id == null || taskId == null) return jsonError(404, "not_found")
  try {
    const result = await completeProjectTask(id, taskId, email)
    if (!result.ok) return projectFailureResponse(result)
    return NextResponse.json({ task: result.task })
  } catch (error) {
    return projectsErrorResponse(error, "complete task")
  }
}
