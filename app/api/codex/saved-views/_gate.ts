/** Saved views route helpers (F8). The gates themselves stay inline in each handler. */
import type { NextResponse } from "next/server"
import { isCodexProjectsEnabled } from "@/lib/codex/flag"
import { isProjectSavedViewScreen } from "@/lib/codex/savedViews"
import { SavedViewsLimitError, SavedViewsUnavailableError } from "@/lib/codex/savedViewsRepo"
import { jsonError } from "../_shared"

/**
 * B42 (C-211, C-234): may `email` use views of `screen`? `tasks` always; a
 * project screen only with codex_projects on and the project visible to
 * them (a private project not theirs, a missing one, or before 0118: no).
 * The projects store loads only for a project screen with the switch on.
 */
export async function canUseSavedViewScreen(screen: string, email: string): Promise<boolean> {
  if (!isProjectSavedViewScreen(screen)) return true
  if (!(await isCodexProjectsEnabled())) return false
  const id = Number(screen.slice("project:".length))
  if (!Number.isSafeInteger(id) || id < 1) return false
  try {
    const { getProject } = await import("@/lib/codex/projectsRepo")
    return (await getProject(id, email)).ok
  } catch {
    return false
  }
}

/** 503 before migration 0117, 409 at the per-person limit, else 500 without detail. */
export function savedViewsErrorResponse(error: unknown, action: string): NextResponse {
  if (error instanceof SavedViewsUnavailableError) {
    return jsonError(503, "saved_views_unavailable", error.message)
  }
  if (error instanceof SavedViewsLimitError) {
    return jsonError(409, "saved_views_limit", error.message)
  }
  console.error(`Codex saved views ${action} failed:`, error)
  return jsonError(500, "saved_views_failed", "Saved views failed. Try again.")
}

/** A positive whole number id from the route segment, else null. */
export function savedViewId(raw: string): number | null {
  return /^[1-9]\d{0,15}$/.test(raw) && Number.isSafeInteger(Number(raw)) ? Number(raw) : null
}
