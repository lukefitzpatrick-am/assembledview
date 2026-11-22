/**
 * Ava tool access tags (F14, B36). Pure: client-safe, no server imports.
 *
 * Every Ava tool is tagged here. The record is keyed by AVA_TOOL_NAMES, so a
 * new tool fails typecheck until it is tagged.
 *
 * - access "read": answers only. Never writes a row, a file or the form, and
 *   never starts a write flow.
 * - access "write": writes, or is a step of a write flow (a preview that issues
 *   an apply token, an interview that persists answers, a file export).
 * - capture: the tool returns captured text (mail, Teams, meeting notes) that
 *   anyone outside the agency could have written. Untrusted. Capture tools are
 *   offered on /tasks/* only, their output is stripped of links and images
 *   before the model sees it, and running one taints the conversation
 *   (lib/ava/taintRules.ts). A capture tool must be access "read".
 *
 * A name with no tag (a tool added outside the registry, a test fixture
 * without a lookup) is treated as write: never on /tasks, never in a tainted
 * conversation. Fail closed.
 */
import type { AVA_TOOL_NAMES } from "./summaries"

export type AvaToolName = (typeof AVA_TOOL_NAMES)[number]

export type AvaToolAccess = "read" | "write"

export type AvaToolTag = {
  access: AvaToolAccess
  /** Returns untrusted captured text (F14). Offered on /tasks/* only. */
  capture?: true
}

export type AvaToolTagLookup = (name: string) => AvaToolTag | undefined

export const AVA_TOOL_TAGS: Record<AvaToolName, AvaToolTag> = {
  get_media_plan_summary: { access: "read" },
  apply_form_patch: { access: "write" },
  apply_parsed_plan: { access: "write" },
  // Card answers accumulate into the staged ingest mapping.
  get_pending_ingest_review: { access: "write" },
  accept_ingest_proposal: { access: "write" },
  load_ingest_into_form: { access: "write" },
  adjust_line_items: { access: "write" },
  calculate_media_math: { access: "read" },
  get_client_details: { access: "read" },
  get_campaign_context: { access: "read" },
  get_saved_audiences: { access: "read" },
  get_best_practice: { access: "read" },
  get_naming_rules: { access: "read" },
  get_creative_assets: { access: "read" },
  get_brand_assets: { access: "read" },
  get_methodology: { access: "read" },
  get_pacing_snapshot: { access: "read" },
  get_delivery_snapshot: { access: "read" },
  get_platform_specs: { access: "read" },
  // Interview answers persist on the version (mi_resolution).
  start_mi_interview: { access: "write" },
  generate_mi_workbook: { access: "write" },
  generate_naming_workbook: { access: "write" },
  load_skill: { access: "read" },
  // Builds a deck and persists commentary into campaign_insights.
  generate_performance_report: { access: "write" },
  get_client_brain: { access: "read" },
  save_client_brain: { access: "write" },
  get_client_insights: { access: "read" },
  get_campaign_insights: { access: "read" },
  query_campaign_lines: { access: "read" },
  query_schedule_months: { access: "read" },
  search_line_items: { access: "read" },
  query_finance_summary: { access: "read" },
  query_xero_status: { access: "read" },
  run_scenario: { access: "read" },
  // Issues the token apply_billing_revision needs: a write-flow step.
  preview_billing_revision: { access: "write" },
  apply_billing_revision: { access: "write" },
  query_true_up: { access: "read" },
  query_data: { access: "read" },
}

/** The registry's tags. Unknown names return undefined (treated as write). */
export const avaToolTag: AvaToolTagLookup = (name) =>
  Object.prototype.hasOwnProperty.call(AVA_TOOL_TAGS, name)
    ? AVA_TOOL_TAGS[name as AvaToolName]
    : undefined

export function isReadTool(name: string, tagOf: AvaToolTagLookup = avaToolTag): boolean {
  return tagOf(name)?.access === "read"
}

/** Capture tools must also be read tools; a capture tag on a write tool is ignored (never offered). */
export function isCaptureTool(name: string, tagOf: AvaToolTagLookup = avaToolTag): boolean {
  const tag = tagOf(name)
  return tag?.capture === true && tag.access === "read"
}

/**
 * The only registry tools Ava is offered on /tasks/* (F14). Read tools only.
 * Capture tools are added on top by tag. Anything else, including any tool
 * added later, is not offered there until it is listed here. There are no
 * Codex task tools in Ava yet; when they land they are listed here.
 */
export const TASKS_TOOL_ALLOWLIST: readonly AvaToolName[] = [
  "get_media_plan_summary",
  "calculate_media_math",
  "get_client_details",
  "get_campaign_context",
  "get_saved_audiences",
  "get_best_practice",
  "get_naming_rules",
  "get_creative_assets",
  "get_brand_assets",
  "get_methodology",
  "get_pacing_snapshot",
  "get_delivery_snapshot",
  "get_platform_specs",
  "load_skill",
  "get_client_brain",
  "get_client_insights",
  "get_campaign_insights",
  "query_campaign_lines",
  "query_schedule_months",
  "search_line_items",
  "query_finance_summary",
  "query_xero_status",
]
