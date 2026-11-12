import { NextResponse } from "next/server"

import { isCodexProjectsEnabled } from "@/lib/codex/flag"
import { parseId, parseUpdateProjectInput } from "@/lib/codex/projects"
import { getProject, updateProject } from "@/lib/codex/projectsRepo"
import { codexFlagGuard, jsonError, requireCodexInternalAccess, sessionEmail } from "../../_shared"
import { projectFailureResponse, projectsErrorResponse } from "../_gate"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ id: string }> }

/** GET: the project and its sections. A private project not yours is 404. */
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
  try {
    const result = await getProject(id, email)
    if (!result.ok) return projectFailureResponse(result)
    return NextResponse.json({ project: result.project, sections: result.sections })
  } catch (error) {
    return projectsErrorResponse(error, "get")
  }
}

/** PATCH: name, status; is_private and owner_email for the owner or creator only (403). */
export async function PATCH(request: Request, context: RouteContext) {
  const flag = await codexFlagGuard()
  if (flag) return flag
  if (!(await isCodexProjectsEnabled())) return jsonError(404, "not_found")
  const auth = await requireCodexInternalAccess(request)
  if ("error" in auth) return auth.error
  const email = sessionEmail(auth.session)
  if (!email) return jsonError(401, "unauthorised")
  const id = parseId((await context.params).id)
  if (id == null) return jsonError(404, "not_found")
  const parsed = parseUpdateProjectInput(await request.json().catch(() => null))
  if (!parsed.ok) return jsonError(400, parsed.error, parsed.message)
  try {
    const result = await updateProject(id, email, parsed.value)
    if (!result.ok) return projectFailureResponse(result)
    return NextResponse.json({ project: result.project })
  } catch (error) {
    return projectsErrorResponse(error, "update")
  }
}
