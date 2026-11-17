import { NextResponse } from "next/server"

import { parseUpdateFieldInput } from "@/lib/codex/customFields"
import { deleteCustomField, updateCustomField } from "@/lib/codex/customFieldsRepo"
import { isFeatureOn } from "@/lib/features/server"
import { parseId } from "@/lib/codex/projects"
import { codexFlagGuard, jsonError, requireCodexInternalAccess, sessionEmail } from "../../../../_shared"
import { projectFailureResponse, projectsErrorResponse } from "../../../_gate"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ id: string; fieldId: string }> }

/**
 * PATCH `{ name?, options?: [{ id?, label }], done_option? }` (B40): rename,
 * reorder, add and remove options (ids kept). Removing an option a live task
 * uses is 409 option_in_use. The type never changes.
 */
export async function PATCH(request: Request, context: RouteContext) {
  const flag = await codexFlagGuard()
  if (flag) return flag
  if (!(await isFeatureOn("codex_projects"))) return jsonError(404, "not_found")
  const auth = await requireCodexInternalAccess(request)
  if ("error" in auth) return auth.error
  const email = sessionEmail(auth.session)
  if (!email) return jsonError(401, "unauthorised")
  const params = await context.params
  const id = parseId(params.id)
  const fieldId = parseId(params.fieldId)
  if (id == null || fieldId == null) return jsonError(404, "not_found")
  const parsed = parseUpdateFieldInput(await request.json().catch(() => null))
  if (!parsed.ok) return jsonError(400, parsed.error, parsed.message)
  try {
    const result = await updateCustomField(id, fieldId, email, parsed.value)
    if (!result.ok) return projectFailureResponse(result)
    return NextResponse.json({ field: result.field })
  } catch (error) {
    return projectsErrorResponse(error, "update field")
  }
}

/** DELETE (B40): refused (409 field_has_values) while any live task has a value. */
export async function DELETE(request: Request, context: RouteContext) {
  const flag = await codexFlagGuard()
  if (flag) return flag
  if (!(await isFeatureOn("codex_projects"))) return jsonError(404, "not_found")
  const auth = await requireCodexInternalAccess(request)
  if ("error" in auth) return auth.error
  const email = sessionEmail(auth.session)
  if (!email) return jsonError(401, "unauthorised")
  const params = await context.params
  const id = parseId(params.id)
  const fieldId = parseId(params.fieldId)
  if (id == null || fieldId == null) return jsonError(404, "not_found")
  try {
    const result = await deleteCustomField(id, fieldId, email)
    if (!result.ok) return projectFailureResponse(result)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return projectsErrorResponse(error, "delete field")
  }
}
