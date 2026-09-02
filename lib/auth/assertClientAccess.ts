import { NextRequest, NextResponse } from "next/server"
import { getUserClientIdentifier, getUserRoles } from "@/lib/rbac"

export type ClientAccess =
  | { ok: true; isClient: boolean }
  | { ok: false; response: NextResponse }

export type DecideClientAccessInput = {
  hasSession: boolean
  isAdmin: boolean
  isClient: boolean
  requestedClientId: number
  callerClientId: number | null
}

export type DecideClientAccessResult =
  | { ok: true; isClient: boolean }
  | { ok: false; status: 401 | 403 }

export type AssertClientAccessDeps = {
  getSession: (request: NextRequest) => Promise<{ user: unknown } | null>
  getUserRoles: (user: unknown) => string[]
  getUserClientIdentifier: (user: unknown) => string | null
  fetchClientBySlug: (slug: string) => Promise<Record<string, unknown> | null>
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
 * when `callerClientId === requestedClientId` and both are positive.
 * Unresolved (0) never grants access — never "show it anyway".
 */
export function decideClientAccess(input: DecideClientAccessInput): DecideClientAccessResult {
  if (!input.hasSession) return { ok: false, status: 401 }
  if (input.isAdmin) return { ok: true, isClient: false }
  if (
    input.isClient &&
    input.requestedClientId > 0 &&
    input.callerClientId != null &&
    input.callerClientId === input.requestedClientId
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
  getUserClientIdentifier: (user) =>
    getUserClientIdentifier(user as Parameters<typeof getUserClientIdentifier>[0]),
  fetchClientBySlug: async (slug) => {
    const { fetchXanoClientRowByUrlSlug } = await import(
      "@/lib/clients/fetchClientRowByUrlSlug"
    )
    return fetchXanoClientRowByUrlSlug(slug)
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

  let callerClientId: number | null = null
  if (session?.user && isClient && !isAdmin) {
    const slug = deps.getUserClientIdentifier(session.user)?.trim() ?? ""
    if (!slug) {
      return { ok: false, response: forbiddenResponse() }
    }
    try {
      callerClientId = clientIdFromRow(await deps.fetchClientBySlug(slug))
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
    callerClientId,
  })
  if (!decided.ok) {
    return {
      ok: false,
      response: decided.status === 401 ? unauthorisedResponse() : forbiddenResponse(),
    }
  }
  return { ok: true, isClient: decided.isClient }
}
