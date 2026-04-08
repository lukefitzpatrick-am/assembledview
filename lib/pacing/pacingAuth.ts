import "server-only"

import axios from "axios"
import type { NextRequest, NextResponse } from "next/server"
import type { User } from "@auth0/nextjs-auth0/types"
import { auth0 } from "@/lib/auth0"
import { xanoUrl } from "@/lib/api/xano"
import { getClientDisplayName, slugifyClientNameForUrl } from "@/lib/clients/slug"
import { getCachedClients } from "@/lib/cache/clientsCache"
import { getUserClientSlugs, getUserRoles } from "@/lib/rbac"
import { pacingJsonError } from "@/lib/pacing/pacingHttp"

export type PacingSession = NonNullable<Awaited<ReturnType<typeof auth0.getSession>>> 

export type RequirePacingAccessResult =
  | { ok: true; session: PacingSession; allowedClientIds: number[] | null }
  | { ok: false; response: NextResponse }

/**
 * Resolves tenant client scope the same way as Finance Forecast:
 * - `null` allowedClientIds → no restriction (admin, or user without `client_slugs` claims).
 * - non-null array → only those numeric Xano `get_clients.id` values.
 * - empty array → no accessible clients (all Snowflake list queries return empty).
 */
export async function requirePacingAccess(request: NextRequest): Promise<RequirePacingAccessResult> {
  const session = await auth0.getSession(request)
  if (!session?.user) {
    return { ok: false, response: pacingJsonError("unauthorised", 401) }
  }

  const roles = getUserRoles(session.user)
  const isAdmin = roles.includes("admin")
  const tenantSlugs = getUserClientSlugs(session.user)

  if (isAdmin || tenantSlugs.length === 0) {
    return { ok: true, session, allowedClientIds: null }
  }

  const ids = await resolveXanoClientIdsFromUrlSlugs(tenantSlugs)
  return { ok: true, session, allowedClientIds: ids }
}

/** Public helper for workers (e.g. alert email) resolving slug tenant claims to Xano client ids. */
export async function resolveXanoClientIdsFromUrlSlugs(slugs: string[]): Promise<number[]> {
  const normalized = new Set(slugs.map((s) => slugifyClientNameForUrl(s)).filter(Boolean))
  return resolveXanoClientIdsForSlugSet(normalized)
}

async function resolveXanoClientIdsForSlugSet(wantSlugs: Set<string>): Promise<number[]> {
  const rows = await loadClientsRows()
  const ids: number[] = []
  for (const raw of rows) {
    const urlSlug = slugifyClientNameForUrl(getClientDisplayName(raw))
    if (!urlSlug || !wantSlugs.has(urlSlug)) continue
    const id = Number((raw as Record<string, unknown>).id)
    if (Number.isFinite(id)) ids.push(id)
  }
  return ids
}

async function loadClientsRows(): Promise<Record<string, unknown>[]> {
  const cached = getCachedClients()
  if (cached?.length) return cached as Record<string, unknown>[]

  try {
    const response = await axios.get(xanoUrl("get_clients", "XANO_CLIENTS_BASE_URL"))
    const data = response.data
    if (Array.isArray(data)) return data as Record<string, unknown>[]
    if (data && typeof data === "object" && Array.isArray((data as { data?: unknown }).data)) {
      return (data as { data: Record<string, unknown>[] }).data
    }
  } catch {
    // fall through
  }
  return []
}

export function parseClientsIdQuery(raw: string | null): number | null {
  if (!raw || !raw.trim()) return null
  const n = Number.parseInt(raw.trim(), 10)
  return Number.isFinite(n) ? n : null
}

/**
 * Ensures an explicit `clients_id` filter is within the caller's scope.
 * When `allowedClientIds` is null, any positive id is allowed.
 */
export function assertClientsIdAllowed(
  clientsId: number | null,
  allowedClientIds: number[] | null
): NextResponse | null {
  if (clientsId === null) return null
  if (allowedClientIds === null) return null
  if (!allowedClientIds.includes(clientsId)) {
    return pacingJsonError("forbidden", 403, { reason: "clients_id_not_in_scope" })
  }
  return null
}

export function mergeClientsFilterForQuery(
  queryClientsId: number | null,
  allowedClientIds: number[] | null
): { mode: "all" } | { mode: "none" } | { mode: "ids"; ids: number[] } {
  return mergeClientsFilterForIdList(
    queryClientsId === null ? null : [queryClientsId],
    allowedClientIds
  )
}

/**
 * When `queryIds` is null/undefined — no explicit filter: all clients (admin) or assigned set (tenant).
 * When `queryIds` is [] — empty explicit selection → none visible.
 * When non-empty — intersect with `allowedClientIds` when that list is set.
 */
export function mergeClientsFilterForIdList(
  queryIds: number[] | null | undefined,
  allowedClientIds: number[] | null
): { mode: "all" } | { mode: "none" } | { mode: "ids"; ids: number[] } {
  if (allowedClientIds !== null && allowedClientIds.length === 0) {
    return { mode: "none" }
  }
  if (queryIds === undefined || queryIds === null) {
    if (allowedClientIds === null) return { mode: "all" }
    return { mode: "ids", ids: [...allowedClientIds] }
  }
  if (queryIds.length === 0) {
    return { mode: "none" }
  }
  if (allowedClientIds === null) {
    return { mode: "ids", ids: queryIds }
  }
  const allowed = new Set(allowedClientIds)
  const intersected = queryIds.filter((id) => allowed.has(id))
  if (intersected.length === 0) return { mode: "none" }
  return { mode: "ids", ids: intersected }
}

export function parseClientsIdsParam(raw: string | null): number[] | null {
  if (raw === null || raw === "") return null
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  const ids = parts.map((p) => Number.parseInt(p, 10)).filter((n) => Number.isFinite(n))
  return ids
}

export function assertClientsIdsAllowed(
  ids: number[],
  allowedClientIds: number[] | null
): NextResponse | null {
  if (allowedClientIds === null) return null
  const allowed = new Set(allowedClientIds)
  for (const id of ids) {
    if (!allowed.has(id)) {
      return pacingJsonError("forbidden", 403, { reason: "clients_id_not_in_scope" })
    }
  }
  return null
}

/**
 * Mirrors `requirePacingAccess` tenant rules using an Auth0-style profile (Management API GET /users/{id}).
 * - Admin (or equivalent) → `null` (unscoped).
 * - No client slug claims → `null` (unscoped).
 * - Otherwise → numeric Xano client ids for those slugs (possibly empty).
 */
export async function resolvePacingTenantNumericIdsFromAuth0LikeUser(user: {
  app_metadata?: Record<string, unknown>
  user_metadata?: Record<string, unknown>
}): Promise<number[] | null> {
  const roles = getUserRoles(user as User)
  if (roles.includes("admin")) return null
  const slugs = getUserClientSlugs(user as User)
  if (slugs.length === 0) return null
  return resolveXanoClientIdsFromUrlSlugs(slugs)
}
