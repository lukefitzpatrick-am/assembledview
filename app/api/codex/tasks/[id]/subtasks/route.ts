import { NextResponse } from "next/server"

import { resolveAssigneeForWrite } from "@/lib/codex/assigneeWrite"
import { isCodexProjectsEnabled } from "@/lib/codex/flag"
import { parseId } from "@/lib/codex/projects"
import { parseCreateSubtaskInput } from "@/lib/codex/taskDetail"
import { createSubtask } from "@/lib/codex/taskDetailRepo"
import { codexFlagGuard, jsonError, requireCodexInternalAccess, sessionEmail } from "../../../_shared"
import { projectFailureResponse, projectsErrorResponse } from "../../../projects/_gate"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ id: string }> }

/**
 * POST `{ title, assignee_email?, start_on?, due_on? }` (B40): a subtask of
 * this task, last. Assigned by is the server's. One level only (409
 * nested_subtask). Edit, complete and delete a subtask through
 * /api/codex/tasks/[subtaskId]. Behind codex_projects; 503 before 0118.
 */
export async function POST(request: Request, context: RouteContext) {
  const flag = await codexFlagGuard()
  if (flag) return flag
  if (!(await isCodexProjectsEnabled())) return jsonError(404, "not_found")
  const auth = await requireCodexInternalAccess(request)
  if ("error" in auth) return auth.error
  const email = sessionEmail(auth.session)
  if (!email) return jsonError(401, "unauthorised")
  const id = parseId((await context.params).id)
  if (id == null) return jsonError(404, "not_found")
  const parsed = parseCreateSubtaskInput(await request.json().catch(() => null))
  if (!parsed.ok) return jsonError(400, parsed.error, parsed.message)
  const input: Parameters<typeof createSubtask>[2] = { ...parsed.value, assignee_name: null }
  if (input.assignee_email) {
    // Alias to the person's main email; a shared address is refused (F16, switch).
    const assignee = await resolveAssigneeForWrite(input.assignee_email, null)
    if (!assignee.ok) return NextResponse.json(assignee.body, { status: assignee.status })
    input.assignee_email = assignee.email
    input.assignee_name = assignee.name ?? null
  }
  try {
    const result = await createSubtask(id, email, input)
    if (!result.ok) return projectFailureResponse(result)
    return NextResponse.json({ subtask: result.subtask }, { status: 201 })
  } catch (error) {
    return projectsErrorResponse(error, "create subtask")
  }
}
