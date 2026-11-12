import { NextResponse } from "next/server"

import { isCodexProjectsEnabled } from "@/lib/codex/flag"
import { parseId, readEmailList } from "@/lib/codex/projects"
import { addProjectMembers, removeProjectMember } from "@/lib/codex/projectsRepo"
import { codexFlagGuard, jsonError, requireCodexInternalAccess, sessionEmail } from "../../../_shared"
import { projectFailureResponse, projectsErrorResponse } from "../../_gate"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ id: string }> }

/** POST `{ emails: [...] }`: add members. Owner or creator only (403). */
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
  const body = (await request.json().catch(() => null)) as { emails?: unknown } | null
  const emails = readEmailList(body?.emails, "emails")
  if (!emails.ok) return jsonError(400, emails.error, emails.message)
  if (emails.value.length === 0) return jsonError(400, "invalid_emails", "Send at least one email address.")
  try {
    const result = await addProjectMembers(id, email, emails.value)
    if (!result.ok) return projectFailureResponse(result)
    return NextResponse.json({ project: result.project })
  } catch (error) {
    return projectsErrorResponse(error, "add members")
  }
}

/** DELETE `?email=`: remove a member. Owner or creator only (403). */
export async function DELETE(request: Request, context: RouteContext) {
  const flag = await codexFlagGuard()
  if (flag) return flag
  if (!(await isCodexProjectsEnabled())) return jsonError(404, "not_found")
  const auth = await requireCodexInternalAccess(request)
  if ("error" in auth) return auth.error
  const email = sessionEmail(auth.session)
  if (!email) return jsonError(401, "unauthorised")
  const id = parseId((await context.params).id)
  if (id == null) return jsonError(404, "not_found")
  const target = readEmailList([new URL(request.url).searchParams.get("email") ?? ""], "email")
  if (!target.ok) return jsonError(400, target.error, target.message)
  try {
    const result = await removeProjectMember(id, email, target.value[0])
    if (!result.ok) return projectFailureResponse(result)
    return NextResponse.json({ project: result.project })
  } catch (error) {
    return projectsErrorResponse(error, "remove member")
  }
}
