/**
 * Codex projects route helpers (S1, B38). The gates themselves stay inline in
 * each handler (codexFlagGuard 404, codex_projects 404, session 401, staff
 * 403), so the tenant inventory and reviewers see them in every route file.
 */
import { NextResponse } from "next/server"

import { ProjectsUnavailableError, type ProjectFailure } from "@/lib/codex/projectsRepo"
import { jsonError } from "../_shared"

/** 503 before migration 0118, else 500 without detail. */
export function projectsErrorResponse(error: unknown, action: string): NextResponse {
  if (error instanceof ProjectsUnavailableError) {
    return jsonError(503, "migration_not_applied", "Codex projects need migration 0118 (codex_s1_projects).")
  }
  console.error(`Codex projects ${action} failed:`, error)
  return jsonError(500, "projects_failed", "Projects failed. Try again.")
}

const FAILURE_STATUS: Record<ProjectFailure["reason"], number> = {
  not_found: 404,
  task_not_found: 404,
  not_owner: 403,
  unknown_client: 400,
  invalid_order: 400,
  mba_taken: 409,
  too_many_sections: 409,
  too_many_members: 409,
  other_project: 409,
  last_done_section: 409,
  section_not_empty: 409,
  no_done_section: 409,
  no_section_for_status: 409,
  anchor_not_in_section: 409,
  task_changed: 409,
  // B40
  subtask_not_on_board: 409,
  start_after_due: 409,
  task_type_fixed: 409,
  not_in_project: 409,
  unknown_field: 400,
  invalid_value: 400,
  nested_subtask: 409,
  too_many_subtasks: 409,
  option_in_use: 409,
  field_has_values: 409,
  unknown_option: 409,
  invalid_done_option: 400,
  too_many_fields: 409,
}

export function projectFailureResponse(failure: ProjectFailure): NextResponse {
  return jsonError(FAILURE_STATUS[failure.reason], failure.reason, failure.message)
}
