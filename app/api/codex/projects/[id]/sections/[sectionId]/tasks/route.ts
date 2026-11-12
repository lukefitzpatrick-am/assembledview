import { NextResponse } from "next/server"

import { isCodexProjectsEnabled } from "@/lib/codex/flag"
import { parseId, parseMoveTaskInput } from "@/lib/codex/projects"
import { moveTaskToSection } from "@/lib/codex/projectsRepo"
import { codexFlagGuard, jsonError, requireCodexInternalAccess, sessionEmail } from "../../../../../_shared"
import { projectFailureResponse, projectsErrorResponse } from "../../../../_gate"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ id: string; sectionId: string }> }

/**
 * POST `{ task_id, sort_order? }`: move a task into this section. Its status
 * becomes the section's category; a done section completes it. A task in
 * another project is 409 other_project.
 */
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
  const sectionId = parseId(params.sectionId)
  if (id == null || sectionId == null) return jsonError(404, "not_found")
  const parsed = parseMoveTaskInput(await request.json().catch(() => null))
  if (!parsed.ok) return jsonError(400, parsed.error, parsed.message)
  try {
    const result = await moveTaskToSection(id, sectionId, email, parsed.value)
    if (!result.ok) return projectFailureResponse(result)
    return NextResponse.json({ task: result.task })
  } catch (error) {
    return projectsErrorResponse(error, "move task")
  }
}
