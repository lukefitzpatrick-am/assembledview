import type { PageContext } from "@/lib/ava/types"
import { featureEnvValue } from "@/lib/features/registry"
import {
  CAMPAIGN_READ_GENERATE_SURFACE,
  CAMPAIGN_READ_GENERATE_TOOLS,
} from "@/lib/campaign-read/generateTools"
import { isTasksPath } from "@/lib/ava/conversationScope"
import {
  TASKS_TOOL_ALLOWLIST,
  avaToolTag,
  isCaptureTool,
  isReadTool,
  type AvaToolTagLookup,
} from "./toolAccess"

const MEDIA_PLAN_CREATE = /^\/mediaplans\/create\/?$/
const MEDIA_PLAN_EDIT = /^\/mediaplans\/mba\/[^/]+\/edit\/?$/
const MBA_DETAIL = /^\/mediaplans\/mba\/[^/]+\/?$/

/**
 * Live switch values for the gated tools. The chat path reads them from
 * lib/features/server (lib/ava/tools/toolFlags.ts) and passes them in. With
 * none passed (tests, pure callers) the env value is the fallback.
 */
export type AvaToolFlags = { billingRevisions: boolean; trueUp: boolean; dataQuery?: boolean; sharepoint?: boolean }

function envToolFlags(): AvaToolFlags {
  return {
    billingRevisions: featureEnvValue("billing_revisions"),
    trueUp: featureEnvValue("true_up"),
    dataQuery: featureEnvValue("ava_data_query"),
    sharepoint: featureEnvValue("ava_sharepoint"),
  }
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

/** query_data: ava_data_query on. Not on /tasks (not on its allowlist). */
const DATA_QUERY_TOOLS = new Set(["query_data"])

/** search_client_files: ava_sharepoint on. Not on /tasks (not on its allowlist). */
const SHAREPOINT_TOOLS = new Set(["search_client_files"])

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
 * Where the turn runs and what the conversation has seen (F14, B36).
 * - `clientRoute`: the pathname the widget sends. Pages with no assistant
 *   bridge (Codex /tasks) publish no PageContext, so this is how the server
 *   knows the turn is on /tasks. Only the /tasks allowlist and capture tools
 *   read it; every other rule reads the PageContext route as before.
 * - `tainted`: captured (untrusted) text has entered this conversation.
 *   Every tool that is not a read tool is dropped, on any page.
 * - `tagOf`: tool tags (tests pass a fixture lookup).
 */
export type AvaToolOfferScope = {
  clientRoute?: string
  tainted?: boolean
  /**
   * The chat request named no usable `route` (an old bundle, a direct API
   * call). The server cannot tell whether the conversation has been on
   * /tasks, so the turn gets read tools only and no web search (F14 L1).
   * Only /api/chat-v2 sets it; other callers (campaign-read generation) do
   * not send a route and keep their own rules.
   */
  routeUnknown?: boolean
  tagOf?: AvaToolTagLookup
}

/** True when either the PageContext route or the widget's route is /tasks or under it. */
export function isTasksSurface(pageContext: PageContext | undefined, clientRoute: string | undefined): boolean {
  return isTasksPath(pageContextRoutePathname(pageContext)) || isTasksPath(clientRoute)
}

/**
 * Anthropic server web search: never on /tasks and never in a tainted
 * conversation, because a search query is a way out for injected text.
 */
export function avaWebSearchAllowed(
  pageContext: PageContext | undefined,
  scope: AvaToolOfferScope = {},
): boolean {
  return !scope.tainted && !scope.routeUnknown && !isTasksSurface(pageContext, scope.clientRoute)
}

/**
 * Surface-aware tool offer. Create/edit mega-pages and unknown/absent routes
 * omit `accept_ingest_proposal` (fail closed). Hub and other known routes keep it.
 * `run_scenario` is offered only on `/pacing/*` and `/dashboard/*`.
 * Billing revision tools (BILLING_REVISIONS) and query_true_up (TRUE_UP) are offered only on
 * `/finance/*` and the MBA detail page (never create or edit). query_data needs
 * ava_data_query on; search_client_files needs ava_sharepoint on.
 * `/tasks/*` is an allowlist (TASKS_TOOL_ALLOWLIST plus capture tools); any
 * tool not on it is not offered there (F14, fail closed). Capture tools are
 * offered on `/tasks/*` only. A tainted conversation, and a chat request with
 * no route, keep read tools only.
 */
export function avaToolDefinitionsForPage<T extends { name: string }>(
  definitions: readonly T[],
  pageContext?: PageContext,
  flags: AvaToolFlags = envToolFlags(),
  scope: AvaToolOfferScope = {},
): T[] {
  const pathname = pageContextRoutePathname(pageContext)
  const revisionsOk = billingRevisionToolsOk(pathname, flags.billingRevisions)
  const trueUpOk = trueUpToolsOk(pathname, flags.trueUp)
  const offered = definitions.filter(
    (t) =>
      (revisionsOk || !BILLING_REVISION_TOOLS.has(t.name)) &&
      (trueUpOk || !TRUE_UP_TOOLS.has(t.name)) &&
      (flags.dataQuery === true || !DATA_QUERY_TOOLS.has(t.name)) &&
      (flags.sharepoint === true || !SHAREPOINT_TOOLS.has(t.name)),
  )
  const tagOf = scope.tagOf ?? avaToolTag
  let out = offerForSurface(offered, pageContext)
  if (isTasksSurface(pageContext, scope.clientRoute)) {
    const allowed = new Set<string>(TASKS_TOOL_ALLOWLIST)
    out = out.filter((t) => (allowed.has(t.name) && isReadTool(t.name, tagOf)) || isCaptureTool(t.name, tagOf))
  } else {
    out = out.filter((t) => !tagOf(t.name)?.capture)
  }
  if (scope.tainted || scope.routeUnknown) {
    out = out.filter((t) => isReadTool(t.name, tagOf))
  }
  return out
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
