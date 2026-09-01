import type { PageContext } from "@/lib/ava/types"

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
 */
export function avaToolDefinitionsForPage<T extends { name: string }>(
  definitions: readonly T[],
  pageContext?: PageContext,
): T[] {
  const pathname = pageContextRoutePathname(pageContext)
  if (!pathname || isMediaPlanCreateOrEditRoute(pageContext)) {
    return definitions.filter((t) => t.name !== "accept_ingest_proposal")
  }
  return [...definitions]
}
