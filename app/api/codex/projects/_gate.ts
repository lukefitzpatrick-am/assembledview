/**
 * Codex projects route helpers (S1, B38). The gates themselves stay inline in
 * each handler (codexFlagGuard 404, codex_projects 404, session 401, staff
 * 403), so the tenant inventory and reviewers see them in every route file.
 */
import { NextResponse } from "next/server"

import { ProjectsUnavailableError, type ProjectFailure } from "@/lib/codex/projectsRepo"
import { PROJECT_FAILURE_STATUS } from "@/lib/codex/projectFailureStatus"
import { jsonError } from "../_shared"

/** 503 before migration 0118, else 500 without detail. */
export function projectsErrorResponse(error: unknown, action: string): NextResponse {
  if (error instanceof ProjectsUnavailableError) {
    return jsonError(503, "migration_not_applied", "Codex projects need migration 0118 (codex_s1_projects).")
  }
  console.error(`Codex projects ${action} failed:`, error)
  return jsonError(500, "projects_failed", "Projects failed. Try again.")
}

export function projectFailureResponse(failure: ProjectFailure): NextResponse {
  return jsonError(PROJECT_FAILURE_STATUS[failure.reason], failure.reason, failure.message)
}
