import type { PageContext } from "@/lib/ava/types"
import { featureEnvValue } from "@/lib/features/registry"
import {
  CAMPAIGN_READ_GENERATE_SURFACE,
  CAMPAIGN_READ_GENERATE_TOOLS,
} from "@/lib/campaign-read/generateTools"

const MEDIA_PLAN_CREATE = /^\/mediaplans\/create\/?$/
const MEDIA_PLAN_EDIT = /^\/mediaplans\/mba\/[^/]+\/edit\/?$/
const MBA_DETAIL = /^\/mediaplans\/mba\/[^/]+\/?$/

/**
 * Live switch values for the gated tools. The chat path reads them from
 * lib/features/server (lib/ava/tools/toolFlags.ts) and passes them in. With
 * none passed (tests, pure callers) the env value is the fallback.
 */
export type AvaToolFlags = { billingRevisions: boolean; trueUp: boolean }

function envToolFlags(): AvaToolFlags {
  return { billingRevisions: featureEnvValue("billing_revisions"), trueUp: featureEnvValue("true_up") }
}

/** Billing revision tools: billing_revisions on, and only on /finance/* or the MBA detail page. */
export const BILLING_REVISION_TOOLS = new Set(["preview_billing_revision", "apply_billing_revision"])

function billingRevisionToolsOk(pathname: string | undefined, on: boolean): boolean {
  if (!on || !pathname) return false
  return pathname === "/finance" || pathname.startsWith("/finance/") || MBA_DETAIL.test(pathname)
}

/** query_true_up: true_up on, and only on /finance/* or the MBA detail page. */
export const TRUE_UP_TOOLS = new Set(["query_true_up"])

function trueUpToolsOk(pathname: string | undefined, on: boolean): boolean {
  if (!on || !pathname) return false
  return pathname === "/finance" || pathname.startsWith("/finance/") || MBA_DETAIL.test(pathname)
}

/** Pathname from PageContext.route — string or `{ pathname }`. Empty/absent → undefined. */
export function pageContextRoutePathname(
  pageContext?: PageContext,
): string | undefined {
  const route = pageContext?.route
  if (typeof route === "string") {
    const trimmed = route.trim()
    return trimmed.length > 0 ? trimmed : undefined
  }
  if (route && typeof route === "object" && typeof route.pathname === "string") {
    const trimmed = route.pathname.trim()
    return trimmed.length > 0 ? trimmed : undefined
  }
  return undefined
}

export function isMediaPlanCreateOrEditRoute(
  pageContext?: PageContext,
): boolean {
  const pathname = pageContextRoutePathname(pageContext)
  if (!pathname) return false
  return MEDIA_PLAN_CREATE.test(pathname) || MEDIA_PLAN_EDIT.test(pathname)
}

/**
 * Surface-aware tool offer. Create/edit mega-pages and unknown/absent routes
 * omit `accept_ingest_proposal` (fail closed). Hub and other known routes keep it.
 * `run_scenario` is offered only on `/pacing/*` and `/dashboard/*`.
 * Billing revision tools (BILLING_REVISIONS) and query_true_up (TRUE_UP) are offered only on
 * `/finance/*` and the MBA detail page (never create or edit).
 */
export function avaToolDefinitionsForPage<T extends { name: string }>(
  definitions: readonly T[],
  pageContext?: PageContext,
  flags: AvaToolFlags = envToolFlags(),
): T[] {
  const pathname = pageContextRoutePathname(pageContext)
  const revisionsOk = billingRevisionToolsOk(pathname, flags.billingRevisions)
  const trueUpOk = trueUpToolsOk(pathname, flags.trueUp)
  const offered = definitions.filter(
    (t) => (revisionsOk || !BILLING_REVISION_TOOLS.has(t.name)) && (trueUpOk || !TRUE_UP_TOOLS.has(t.name)),
  )
  return offerForSurface(offered, pageContext)
}

function offerForSurface<T extends { name: string }>(
  definitions: readonly T[],
  pageContext?: PageContext,
): T[] {
  const surface =
    pageContext?.state && typeof pageContext.state === "object"
      ? String((pageContext.state as { surface?: unknown }).surface ?? "")
      : ""
  if (surface === CAMPAIGN_READ_GENERATE_SURFACE) {
    const allowed = new Set<string>(CAMPAIGN_READ_GENERATE_TOOLS)
    return definitions.filter((t) => allowed.has(t.name))
  }
  const pathname = pageContextRoutePathname(pageContext)
  const scenarioOk =
    Boolean(pathname) &&
    (pathname!.startsWith("/pacing") || pathname!.startsWith("/dashboard"))
  if (!pathname || isMediaPlanCreateOrEditRoute(pageContext)) {
    return definitions.filter(
      (t) => t.name !== "accept_ingest_proposal" && t.name !== "run_scenario",
    )
  }
  if (!scenarioOk) {
    return definitions.filter((t) => t.name !== "run_scenario")
  }
  return [...definitions]
}
