import type { PageContext } from "@/lib/ava/types"
import {
  CAMPAIGN_READ_GENERATE_SURFACE,
  CAMPAIGN_READ_GENERATE_TOOLS,
} from "@/lib/campaign-read/generateTools"

const MEDIA_PLAN_CREATE = /^\/mediaplans\/create\/?$/
const MEDIA_PLAN_EDIT = /^\/mediaplans\/mba\/[^/]+\/edit\/?$/

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
 */
export function avaToolDefinitionsForPage<T extends { name: string }>(
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
