import { NextResponse } from "next/server"

import { isFeatureOn } from "@/lib/features/server"
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
  if (!(await isFeatureOn("codex_projects"))) return jsonError(404, "not_found")
  const auth = await requireCodexInternalAccess(request)
  if ("error" in auth) return auth.error
  const email = sessionEmail(auth.session)
  if (!email) return jsonError(401, "unauthorised")
  const params = await context.params
  const id = parseId(params.id)
  const taskId = parseId(params.taskId)
  if (id == null || taskId == null) return jsonError(404, "not_found")
  try {
    // B41: followers are told the task was completed (codex_notifications).
    const notify = await import("@/lib/codex/notify")
    const before = await notify.beforeTaskWrite([taskId])
    const result = await completeProjectTask(id, taskId, email)
    if (!result.ok) return projectFailureResponse(result)
    await notify.afterTaskWrite(email, before, [taskId])
    return NextResponse.json({ task: result.task })
  } catch (error) {
    return projectsErrorResponse(error, "complete task")
  }
}
