import { NextRequest, NextResponse } from "next/server"
import { getUserClientSlugs, getUserRoles } from "@/lib/rbac"
import type { ClientGroup } from "@/lib/clients/clientGroup"
import { clientIdsFromGroup } from "@/lib/clients/clientGroup"

export type ClientAccess =
  | { ok: true; isClient: boolean }
  | { ok: false; response: NextResponse }

export type DecideClientAccessInput = {
  hasSession: boolean
  isAdmin: boolean
  isClient: boolean
  requestedClientId: number
  callerClientIds: ReadonlySet<number>
}

export type DecideClientAccessResult =
  | { ok: true; isClient: boolean }
  | { ok: false; status: 401 | 403 }

export type AssertClientAccessDeps = {
  getSession: (request: NextRequest) => Promise<{ user: unknown } | null>
  getUserRoles: (user: unknown) => string[]
  getUserClientSlugs: (user: unknown) => string[]
  fetchClientGroupBySlug: (slug: string) => Promise<ClientGroup | null>
}

function forbiddenResponse(): NextResponse {
  return NextResponse.json({ error: "forbidden" }, { status: 403 })
}

function unauthorisedResponse(): NextResponse {
  return NextResponse.json({ error: "unauthorised" }, { status: 401 })
}

/** Positive integer clients.id only — 0 is the CB-1 unresolved sentinel. */
export function clientIdFromRow(row: Record<string, unknown> | null): number | null {
  if (!row) return null
  const raw = row.id
  const n = typeof raw === "number" ? raw : Number(raw)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.trunc(n)
}

/**
 * Per-client tenant gate. Admin is unscoped. A client-role caller passes only
 * when `requestedClientId` is in `callerClientIds` (the resolveClientGroup
 * member-id set) and both the requested id and the set entry are positive.
 * Unresolved (0) never grants access — never "show it anyway".
 */
export function decideClientAccess(input: DecideClientAccessInput): DecideClientAccessResult {
  if (!input.hasSession) return { ok: false, status: 401 }
  if (input.isAdmin) return { ok: true, isClient: false }
  if (
    input.isClient &&
    input.requestedClientId > 0 &&
    input.callerClientIds.has(input.requestedClientId)
  ) {
    return { ok: true, isClient: true }
  }
  return { ok: false, status: 403 }
}

const defaultDeps: AssertClientAccessDeps = {
  getSession: async (request) => {
    const { auth0 } = await import("@/lib/auth0")
    const session = await auth0.getSession(request)
    return session?.user ? { user: session.user } : null
  },
  getUserRoles: (user) => getUserRoles(user as Parameters<typeof getUserRoles>[0]),
  getUserClientSlugs: (user) =>
    getUserClientSlugs(user as Parameters<typeof getUserClientSlugs>[0]),
  fetchClientGroupBySlug: async (slug) => {
    const { fetchClientGroupByUrlSlug } = await import(
      "@/lib/clients/fetchClientRowByUrlSlug"
    )
    return fetchClientGroupByUrlSlug(slug)
  },
}

/**
 * Session + tenant check against a `clients.id`.
 *
 * Future call sites (do not move in this commit):
 * - `app/dashboard/[slug]/[mba_number]/page.tsx` slug equality
 * - `app/dashboard/[slug]/creative/page.tsx` slug equality
 */
export async function assertClientAccess(
  request: NextRequest,
  clientId: number,
  deps: AssertClientAccessDeps = defaultDeps,
): Promise<ClientAccess> {
  const session = await deps.getSession(request)
  const roles = session?.user ? deps.getUserRoles(session.user) : []
  const isAdmin = roles.includes("admin")
  const isClient = roles.includes("client")

  let callerClientIds: Set<number> = new Set()
  if (session?.user && isClient && !isAdmin) {
    const slugs = deps
      .getUserClientSlugs(session.user)
      .map((s) => s.trim())
      .filter(Boolean)
    if (slugs.length === 0) {
      return { ok: false, response: forbiddenResponse() }
    }
    try {
      for (const slug of slugs) {
        const ids = clientIdsFromGroup(await deps.fetchClientGroupBySlug(slug))
        for (const id of ids) callerClientIds.add(id)
      }
    } catch (err) {
      console.warn("[assertClientAccess] Failed to resolve client row", { err })
      return { ok: false, response: forbiddenResponse() }
    }
  }

  const decided = decideClientAccess({
    hasSession: Boolean(session?.user),
    isAdmin,
    isClient,
    requestedClientId: clientId,
    callerClientIds,
  })
  if (!decided.ok) {
    return {
      ok: false,
      response: decided.status === 401 ? unauthorisedResponse() : forbiddenResponse(),
    }
  }
  return { ok: true, isClient: decided.isClient }
}
