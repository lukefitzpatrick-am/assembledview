import { NextResponse } from "next/server"
import { isProjectSavedViewScreen, parseSavedViewInput, parseSavedViewScreen } from "@/lib/codex/savedViews"
import {
  createSavedView,
  listSavedViews,
} from "@/lib/codex/savedViewsRepo"
import { isFeatureOn } from "@/lib/features/server"
import { codexFlagGuard, jsonError, requireCodexInternalAccess, sessionEmail } from "../_shared"
import { canUseSavedViewScreen, savedViewsErrorResponse } from "./_gate"

export const runtime = "nodejs"

/**
 * GET: own views and every shared view for `?screen=` (default tasks;
 * `project:<id>` with codex_projects on, B40). The switch needs migration
 * 0117 (B48), so the table is always there.
 */
export async function GET(request: Request) {
  const flag = await codexFlagGuard()
  if (flag) return flag
  if (!(await isFeatureOn("codex_saved_views"))) return jsonError(404, "not_found")
  const auth = await requireCodexInternalAccess(request)
  if ("error" in auth) return auth.error
  const email = sessionEmail(auth.session)
  if (!email) return jsonError(401, "unauthorised")
  const screen = parseSavedViewScreen(new URL(request.url).searchParams.get("screen")?.trim() || "tasks")
  // A project's views (B40) need codex_projects too.
  if (!screen || (isProjectSavedViewScreen(screen) && !(await isFeatureOn("codex_projects")))) {
    return jsonError(400, "invalid_screen", "Unknown screen")
  }
  // B42 (C-234): a private project's views only for people who can see it.
  if (!(await canUseSavedViewScreen(screen, email))) return NextResponse.json({ items: [] })
  try {
    const items = await listSavedViews(email, screen)
    return NextResponse.json({ items })
  } catch (error) {
    return savedViewsErrorResponse(error, "list")
  }
}

/** POST: save a view owned by the signed-in person. */
export async function POST(request: Request) {
  const flag = await codexFlagGuard()
  if (flag) return flag
  if (!(await isFeatureOn("codex_saved_views"))) return jsonError(404, "not_found")
  const auth = await requireCodexInternalAccess(request)
  if ("error" in auth) return auth.error
  const email = sessionEmail(auth.session)
  if (!email) return jsonError(401, "unauthorised")
  const body = await request.json().catch(() => null)
  const parsed = parseSavedViewInput(body)
  if (!parsed.ok) return jsonError(400, parsed.error, parsed.message)
  if (isProjectSavedViewScreen(parsed.value.screen) && !(await isFeatureOn("codex_projects"))) {
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
