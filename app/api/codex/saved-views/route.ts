import { NextResponse } from "next/server"
import { isProjectSavedViewScreen, parseSavedViewInput, parseSavedViewScreen } from "@/lib/codex/savedViews"
import {
  createSavedView,
  listSavedViews,
  SavedViewsUnavailableError,
} from "@/lib/codex/savedViewsRepo"
import { isCodexProjectsEnabled, isCodexSavedViewsEnabled } from "@/lib/codex/flag"
import { codexFlagGuard, jsonError, requireCodexInternalAccess, sessionEmail } from "../_shared"
import { canUseSavedViewScreen, savedViewsErrorResponse } from "./_gate"

export const runtime = "nodejs"

/**
 * GET: own views and every shared view for `?screen=` (default tasks;
 * `project:<id>` with codex_projects on, B40).
 * Before migration 0117: 200 `{ available: false, items: [] }`, so the page
 * hides the views menu and still loads.
 */
export async function GET(request: Request) {
  const flag = await codexFlagGuard()
  if (flag) return flag
  if (!(await isCodexSavedViewsEnabled())) return jsonError(404, "not_found")
  const auth = await requireCodexInternalAccess(request)
  if ("error" in auth) return auth.error
  const email = sessionEmail(auth.session)
  if (!email) return jsonError(401, "unauthorised")
  const screen = parseSavedViewScreen(new URL(request.url).searchParams.get("screen")?.trim() || "tasks")
  // A project's views (B40) need codex_projects too.
  if (!screen || (isProjectSavedViewScreen(screen) && !(await isCodexProjectsEnabled()))) {
    return jsonError(400, "invalid_screen", "Unknown screen")
  }
  // B42 (C-234): a private project's views only for people who can see it.
  if (!(await canUseSavedViewScreen(screen, email))) return NextResponse.json({ available: true, items: [] })
  try {
    const items = await listSavedViews(email, screen)
    return NextResponse.json({ available: true, items })
  } catch (error) {
    if (error instanceof SavedViewsUnavailableError) {
      return NextResponse.json({ available: false, items: [] })
    }
    return savedViewsErrorResponse(error, "list")
  }
}

/** POST: save a view owned by the signed-in person. */
export async function POST(request: Request) {
  const flag = await codexFlagGuard()
  if (flag) return flag
  if (!(await isCodexSavedViewsEnabled())) return jsonError(404, "not_found")
  const auth = await requireCodexInternalAccess(request)
  if ("error" in auth) return auth.error
  const email = sessionEmail(auth.session)
  if (!email) return jsonError(401, "unauthorised")
  const body = await request.json().catch(() => null)
  const parsed = parseSavedViewInput(body)
  if (!parsed.ok) return jsonError(400, parsed.error, parsed.message)
  if (isProjectSavedViewScreen(parsed.value.screen) && !(await isCodexProjectsEnabled())) {
    return jsonError(400, "invalid_screen", "Unknown screen")
  }
  if (!(await canUseSavedViewScreen(parsed.value.screen, email))) return jsonError(404, "not_found")
  try {
    const view = await createSavedView(email, parsed.value)
    return NextResponse.json(view, { status: 201 })
  } catch (error) {
    return savedViewsErrorResponse(error, "create")
  }
}
