export type ClientPathFenceResult = {
  redirectTarget: string | null
  reason: string | null
}

/**
 * Client-role page fence. `slugs` is the ordered tenant set from
 * `getUserClientSlugs`; `slugs[0]` is the primary (landing) slug.
 */
export function resolveClientPageFence(
  pathname: string,
  slugs: string[],
): ClientPathFenceResult {
  const primary = slugs[0]
  if (!primary || slugs.length === 0) {
    return { redirectTarget: "/unauthorized", reason: "client-missing-slug" }
  }

  const allowed = new Set(slugs.map((s) => s.toLowerCase()))

  if (pathname === "/") {
    return { redirectTarget: `/dashboard/${primary}`, reason: "client-root-redirect" }
  }
  if (pathname === "/dashboard") {
    return { redirectTarget: `/dashboard/${primary}`, reason: "client-dashboard-redirect" }
  }
  if (pathname.startsWith("/dashboard")) {
    const match = pathname.match(/^\/dashboard\/([^/]+)/)
    const segment = match?.[1]
    const requested = segment ? decodeURIComponent(segment).toLowerCase() : ""
    if (requested && allowed.has(requested)) {
      return { redirectTarget: null, reason: null }
    }
    return { redirectTarget: `/dashboard/${primary}`, reason: "client-cross-tenant-block" }
  }
  if (
    pathname === "/knowledge" ||
    pathname.startsWith("/knowledge/") ||
    pathname === "/forbidden" ||
    pathname === "/unauthorized"
  ) {
    return { redirectTarget: null, reason: null }
  }
  return { redirectTarget: `/dashboard/${primary}`, reason: "client-non-dashboard-redirect" }
}
