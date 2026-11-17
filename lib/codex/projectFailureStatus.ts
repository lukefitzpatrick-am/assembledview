/**
 * HTTP status for each projects store refusal (B38 to B40). Pure, so routes
 * that load the projects store lazily (PATCH and bulk on tasks) map the same
 * way as /api/codex/projects/** without importing it.
 */
import type { ProjectFailureReason } from "@/lib/codex/projectsRepo"

export const PROJECT_FAILURE_STATUS: Record<ProjectFailureReason, number> = {
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
  // B41
  follower_no_access: 409,
  not_uploader: 403,
  too_many_attachments: 409,
  // B41fix
  not_on_roster: 400,
  ambiguous_address: 400,
  // B42
  progress_field_invalid: 409,
  // B42fix
  assignee_no_access: 409,
  progress_conflict: 409,
  // B43
  open_tasks_lose_access: 409,
}
