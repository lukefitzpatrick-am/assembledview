import { NextResponse } from "next/server"

import { isFeatureOn } from "@/lib/features/server"
import { parseId, parseReorderInput } from "@/lib/codex/projects"
import { reorderSubtasks } from "@/lib/codex/taskDetailRepo"
import { codexFlagGuard, jsonError, requireCodexInternalAccess, sessionEmail, hiddenTaskGuard } from "../../../../_shared"
import { projectFailureResponse, projectsErrorResponse } from "../../../../projects/_gate"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ id: string }> }

/** POST `{ ordered_ids }` (B40): every live subtask once (400 invalid_order). */
export async function POST(request: Request, context: RouteContext) {
  const flag = await codexFlagGuard()
  if (flag) return flag
  if (!(await isFeatureOn("codex_projects"))) return jsonError(404, "not_found")
  const auth = await requireCodexInternalAccess(request)
  if ("error" in auth) return auth.error
  const hidden = await hiddenTaskGuard(context, auth.session)
  if (hidden) return hidden
  const email = sessionEmail(auth.session)
  if (!email) return jsonError(401, "unauthorised")
  const id = parseId((await context.params).id)
  if (id == null) return jsonError(404, "not_found")
  const parsed = parseReorderInput(await request.json().catch(() => null))
  if (!parsed.ok) return jsonError(400, parsed.error, parsed.message)
  try {
    const result = await reorderSubtasks(id, email, parsed.value)
    if (!result.ok) return projectFailureResponse(result)
    return NextResponse.json({ subtasks: result.subtasks })
  } catch (error) {
    return projectsErrorResponse(error, "reorder subtasks")
  }
}
