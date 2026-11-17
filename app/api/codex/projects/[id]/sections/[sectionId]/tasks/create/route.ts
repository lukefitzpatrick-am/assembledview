import { NextResponse } from "next/server"

import { isFeatureOn } from "@/lib/features/server"
import { parseCreateSectionTasksInput, parseId } from "@/lib/codex/projects"
import { createTasksInSection } from "@/lib/codex/projectsRepo"
import { codexFlagGuard, jsonError, requireCodexInternalAccess, sessionEmail } from "../../../../../../_shared"
import { projectFailureResponse, projectsErrorResponse } from "../../../../../_gate"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ id: string; sectionId: string }> }

/**
 * POST `{ titles: [...] }` (B39): inline add (one title) and bulk paste (up
 * to 200) into this section. New tasks go last, take the section's status
 * and the project's client and MBA, and are created by you, unassigned.
 */
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
  const sectionId = parseId(params.sectionId)
  if (id == null || sectionId == null) return jsonError(404, "not_found")
  const parsed = parseCreateSectionTasksInput(await request.json().catch(() => null))
  if (!parsed.ok) return jsonError(400, parsed.error, parsed.message)
  try {
    const result = await createTasksInSection(id, sectionId, email, parsed.value.titles)
    if (!result.ok) return projectFailureResponse(result)
    return NextResponse.json({ tasks: result.tasks }, { status: 201 })
  } catch (error) {
    return projectsErrorResponse(error, "create tasks")
  }
}
