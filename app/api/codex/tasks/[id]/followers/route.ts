import { NextResponse } from "next/server"

import { followTask, listFollowers, unfollowTask } from "@/lib/codex/collabRepo"
import { isCodexNotificationsEnabled, isCodexProjectsEnabled, isCodexRosterAliasesEnabled } from "@/lib/codex/flag"
import { parseId } from "@/lib/codex/projects"
import { looksLikeEmail } from "@/lib/codex/rosterResolve"
import { codexFlagGuard, jsonError, requireCodexInternalAccess, sessionEmail } from "../../../_shared"
import { projectFailureResponse, projectsErrorResponse } from "../../../projects/_gate"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ id: string }> }

/**
 * Task followers (B41). GET the list and whether you follow. POST `{}` to
 * follow, or `{ email }` to add a colleague (told with codex_notifications
 * on). Only active roster members follow (the B36 resolver, aliases with
 * codex_roster_aliases): anyone else is 400 not_on_roster, a shared address
 * 400 ambiguous_address; someone who cannot see a private project is 409
 * follower_no_access.
 * DELETE stops you following (yourself only). Behind codex_projects; 503
 * before 0118; a private project's task you cannot see is 404.
 */
async function gate(request: Request, context: RouteContext) {
  const flag = await codexFlagGuard()
  if (flag) return { ok: false as const, error: flag }
  if (!(await isCodexProjectsEnabled())) return { ok: false as const, error: jsonError(404, "not_found") }
  const auth = await requireCodexInternalAccess(request)
  if ("error" in auth) return { ok: false as const, error: auth.error }
  const email = sessionEmail(auth.session)
  if (!email) return { ok: false as const, error: jsonError(401, "unauthorised") }
  const id = parseId((await context.params).id)
  if (id == null) return { ok: false as const, error: jsonError(404, "not_found") }
  return { ok: true as const, email, id }
}

export async function GET(request: Request, context: RouteContext) {
  const g = await gate(request, context)
  if (!g.ok) return g.error
  try {
    const result = await listFollowers(g.id, g.email)
    if (!result.ok) return projectFailureResponse(result)
    return NextResponse.json({ followers: result.followers, following: result.following })
  } catch (error) {
    return projectsErrorResponse(error, "list followers")
  }
}

export async function POST(request: Request, context: RouteContext) {
  const g = await gate(request, context)
  if (!g.ok) return g.error
  const body = (await request.json().catch(() => ({}))) as unknown
  if (body !== null && (typeof body !== "object" || Array.isArray(body))) return jsonError(400, "bad_request", "Expected an object body.")
  const raw = (body ?? {}) as Record<string, unknown>
  let target: string | null = null
  if (raw.email !== undefined && raw.email !== null && raw.email !== "") {
    if (typeof raw.email !== "string" || !looksLikeEmail(raw.email)) return jsonError(400, "invalid_email", "email must be an email address.")
    target = raw.email.trim().toLowerCase()
  }
  try {
    const [notify, aliases] = await Promise.all([isCodexNotificationsEnabled(), isCodexRosterAliasesEnabled()])
    const result = await followTask(g.id, g.email, target, { notify, aliases })
    if (!result.ok) return projectFailureResponse(result)
    return NextResponse.json({ followers: result.followers, following: result.following })
  } catch (error) {
    return projectsErrorResponse(error, "follow task")
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const g = await gate(request, context)
  if (!g.ok) return g.error
  try {
    const result = await unfollowTask(g.id, g.email)
    if (!result.ok) return projectFailureResponse(result)
    return NextResponse.json({ followers: result.followers, following: result.following })
  } catch (error) {
    return projectsErrorResponse(error, "unfollow task")
  }
}
