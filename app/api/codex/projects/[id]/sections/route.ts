import { NextResponse } from "next/server"

import { isFeatureOn } from "@/lib/features/server"
import { parseCreateSectionInput, parseId } from "@/lib/codex/projects"
import { createSection, listSections } from "@/lib/codex/projectsRepo"
import { codexFlagGuard, jsonError, requireCodexInternalAccess, sessionEmail } from "../../../_shared"
import { projectFailureResponse, projectsErrorResponse } from "../../_gate"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ id: string }> }

/** GET: the project's sections in board order. */
export async function GET(request: Request, context: RouteContext) {
  const flag = await codexFlagGuard()
  if (flag) return flag
  if (!(await isFeatureOn("codex_projects"))) return jsonError(404, "not_found")
  const auth = await requireCodexInternalAccess(request)
  if ("error" in auth) return auth.error
  const email = sessionEmail(auth.session)
  if (!email) return jsonError(401, "unauthorised")
  const id = parseId((await context.params).id)
  if (id == null) return jsonError(404, "not_found")
  try {
    const result = await listSections(id, email)
    if (!result.ok) return projectFailureResponse(result)
    return NextResponse.json({ items: result.sections })
  } catch (error) {
    return projectsErrorResponse(error, "list sections")
  }
}

/** POST `{ name, status_category?, collapsed_default? }`: a new last section; category suggested from the name. */
export async function POST(request: Request, context: RouteContext) {
  const flag = await codexFlagGuard()
  if (flag) return flag
  if (!(await isFeatureOn("codex_projects"))) return jsonError(404, "not_found")
  const auth = await requireCodexInternalAccess(request)
  if ("error" in auth) return auth.error
  const email = sessionEmail(auth.session)
  if (!email) return jsonError(401, "unauthorised")
  const id = parseId((await context.params).id)
  if (id == null) return jsonError(404, "not_found")
  const parsed = parseCreateSectionInput(await request.json().catch(() => null))
  if (!parsed.ok) return jsonError(400, parsed.error, parsed.message)
  try {
    const result = await createSection(id, email, parsed.value)
    if (!result.ok) return projectFailureResponse(result)
    return NextResponse.json({ section: result.section }, { status: 201 })
  } catch (error) {
    return projectsErrorResponse(error, "create section")
  }
}
