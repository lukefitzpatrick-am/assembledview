/**
 * The plan form's half of the S1 publish validation set (B54, S1 A). Both
 * pages run it on the lines they are about to post, beside the publisher
 * guard preflight, so the planner gets the server's answer before the round
 * trip. The server check (`savePlanVersion`) stays the real guard.
 */
import { clientFeatureOn } from "@/lib/features/client"
import {
  publishRefusalBody,
  validatePlanForPublish,
  type PublishLine,
  type PublishProblem,
  type PublishRefusalBody,
  type PublishValidation,
} from "@/lib/mediaplan/publishValidation"
import { stripEmptyLinesOnPublish, type EmptyLineFields } from "@/lib/mediaplan/stripEmptyLineItems"

/** What the issues rail shows: the problems, and whether refusals stop publish. */
export type PlanPublishCheck = { result: PublishValidation; refusing: boolean }

export const NO_PUBLISH_CHECK: PlanPublishCheck = { result: { refuse: [], warn: [] }, refusing: false }

/**
 * Publish only. The same lines the server checks (empty lines stripped
 * first). `stop` is the refusal to show when the switch is on; off, the
 * problems still come back for the rail and the publish goes ahead.
 */
export function publishValidationPreflight(
  mode: "draft" | "new_version" | "publish" | null | undefined,
  plan: { campaignStartDate: string | null; campaignEndDate: string | null },
  lineItems: readonly (PublishLine & EmptyLineFields)[],
  on: boolean = clientFeatureOn("publish_validation"),
): { check: PlanPublishCheck; stop: PublishRefusalBody | null } {
  if (mode !== "publish") return { check: NO_PUBLISH_CHECK, stop: null }
  const checked = stripEmptyLinesOnPublish(mode, [...lineItems]).lineItems
  const result = validatePlanForPublish({ ...plan, lineItems: checked })
  return {
    check: { result, refusing: on },
    stop: on && result.refuse.length > 0 ? publishRefusalBody(result.refuse) : null,
  }
}

/** The server's 422 (`PUBLISH_VALIDATION_REFUSED`) as a rail check. */
export function publishCheckFromRefusal(problems: readonly PublishProblem[] | undefined): PlanPublishCheck {
  return { result: { refuse: [...(problems ?? [])], warn: [] }, refusing: true }
}

export function publishRefusedToast(body: { error?: string }): { title: string; description: string } {
  return { title: "Publish refused", description: body.error || "Fix the lines listed in the issues panel, then publish." }
}
