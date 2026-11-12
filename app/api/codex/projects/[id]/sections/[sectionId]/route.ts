import { NextResponse } from "next/server"

import { isCodexProjectsEnabled } from "@/lib/codex/flag"
import { parseId, parseUpdateSectionInput } from "@/lib/codex/projects"
import { deleteSection, updateSection } from "@/lib/codex/projectsRepo"
import { codexFlagGuard, jsonError, requireCodexInternalAccess, sessionEmail } from "../../../../_shared"
import { projectFailureResponse, projectsErrorResponse } from "../../../_gate"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ id: string; sectionId: string }> }

/** PATCH `{ name?, status_category?, collapsed_default? }`. The last done section keeps done (409). */
export async function PATCH(request: Request, context: RouteContext) {
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
  const parsed = parseUpdateSectionInput(await request.json().catch(() => null))
  if (!parsed.ok) return jsonError(400, parsed.error, parsed.message)
  try {
    const result = await updateSection(id, sectionId, email, parsed.value)
    if (!result.ok) return projectFailureResponse(result)
    return NextResponse.json({ section: result.section })
  } catch (error) {
    return projectsErrorResponse(error, "update section")
  }
}

/** DELETE: only with no live tasks (409 section_not_empty), never the last done section (409). */
export async function DELETE(request: Request, context: RouteContext) {
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
  try {
    const result = await deleteSection(id, sectionId, email)
    if (!result.ok) return projectFailureResponse(result)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return projectsErrorResponse(error, "delete section")
  }
}
