import { NextResponse } from "next/server"

import { isFeatureOn } from "@/lib/features/server"
import { isProjectStatus, parseCreateProjectInput } from "@/lib/codex/projects"
import { createProject, listProjects } from "@/lib/codex/projectsRepo"
import { codexFlagGuard, jsonError, requireCodexInternalAccess, sessionEmail } from "../_shared"
import { projectFailureResponse, projectsErrorResponse } from "./_gate"

export const runtime = "nodejs"

/**
 * GET: live projects the signed-in person may see (private projects to owner,
 * creator and members only), by name. `?status=active|on_hold|closed`.
 */
export async function GET(request: Request) {
  const flag = await codexFlagGuard()
  if (flag) return flag
  if (!(await isFeatureOn("codex_projects"))) return jsonError(404, "not_found")
  const auth = await requireCodexInternalAccess(request)
  if ("error" in auth) return auth.error
  const email = sessionEmail(auth.session)
  if (!email) return jsonError(401, "unauthorised")
  const rawStatus = new URL(request.url).searchParams.get("status")?.trim() || ""
  if (rawStatus && !isProjectStatus(rawStatus)) {
    return jsonError(400, "invalid_status", "status must be active, on_hold or closed.")
  }
  try {
    const items = await listProjects(email, isProjectStatus(rawStatus) ? { status: rawStatus } : {})
    return NextResponse.json({ items })
  } catch (error) {
    return projectsErrorResponse(error, "list")
  }
}

/** POST: create a project with its sections (To do, In progress, Done by default). */
export async function POST(request: Request) {
  const flag = await codexFlagGuard()
  if (flag) return flag
  if (!(await isFeatureOn("codex_projects"))) return jsonError(404, "not_found")
  const auth = await requireCodexInternalAccess(request)
  if ("error" in auth) return auth.error
  const email = sessionEmail(auth.session)
  if (!email) return jsonError(401, "unauthorised")
  const parsed = parseCreateProjectInput(await request.json().catch(() => null))
  if (!parsed.ok) return jsonError(400, parsed.error, parsed.message)
  try {
    const result = await createProject(email, parsed.value)
    if (!result.ok) return projectFailureResponse(result)
    return NextResponse.json({ project: result.project, sections: result.sections }, { status: 201 })
  } catch (error) {
    return projectsErrorResponse(error, "create")
  }
}
