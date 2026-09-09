import { NextRequest, NextResponse } from "next/server"
import { getUserRoles, getUserClientSlugs, getUserMbaNumbers } from "@/lib/rbac"
import type { ClientGroup } from "@/lib/clients/clientGroup"
import { mbaNumberMatchesClientIdentifier } from "@/lib/auth/mbaNumberMatchesClientIdentifier"

export type ClientMbaAccess =
  | { ok: true; isClient: boolean }
  | { ok: false; response: NextResponse }

export type ClientMbaDenyPath = "mba_numbers" | "identifier" | "no-row"

export type ClientMbaScope =
  | { ok: false; response: NextResponse; denyPath?: ClientMbaDenyPath; email?: string; slug?: string | null; slugs?: string[] }
  | {
      ok: true
      isClient: boolean
      /** True when the caller may access this MBA number. */
      allows: (mbaNumber: string) => boolean
      denyPath: Exclude<ClientMbaDenyPath, "no-row">
      email?: string
      slug?: string | null
      slugs?: string[]
    }

export type CheckClientMbaAccessDeps = {
  getSession?: (request: NextRequest) => Promise<{ user: unknown } | null>
  fetchClientGroupByUrlSlug?: (slug: string) => Promise<ClientGroup | null>
}

function forbiddenResponse(): NextResponse {
  return NextResponse.json({ error: "forbidden" }, { status: 403 })
}

function logAccessDeny(input: {
  email: string | undefined
  slug: string | null | undefined
  slugs?: string[]
  mba: string
  path: ClientMbaDenyPath
}): void {
  console.info("[checkClientMbaAccess] deny", {
    email: input.email,
    slug: input.slug ?? null,
    slugs: input.slugs ?? [],
    mba: input.mba,
    path: input.path,
  })
}

async function defaultGetSession(request: NextRequest): Promise<{ user: unknown } | null> {
  const { auth0 } = await import("@/lib/auth0")
  const session = await auth0.getSession(request)
  return session?.user ? { user: session.user } : null
}

async function defaultFetchClientGroupByUrlSlug(slug: string): Promise<ClientGroup | null> {
  const { fetchClientGroupByUrlSlug } = await import(
    "@/lib/clients/fetchClientRowByUrlSlug"
  )
  return fetchClientGroupByUrlSlug(slug)
}

/**
 * Resolve the caller's MBA scope once (staff = unrestricted; client = mba_numbers
 * list or mbaidentifier prefix matcher). Prefer this for list endpoints so the
 * client-row lookup is not repeated per row.
 *
 * Primary path: `app_metadata.mba_numbers` (exact membership).
 * Fallback: `mbaNumberMatchesClientIdentifier` against the group's `mbaidentifier`
 * (slug resolves through `resolveClientGroup`).
 */
export async function resolveClientMbaScope(
  request: NextRequest,
  deps: CheckClientMbaAccessDeps = {}
): Promise<ClientMbaScope> {
  const getSession = deps.getSession ?? defaultGetSession
  const fetchClientGroupByUrlSlug =
    deps.fetchClientGroupByUrlSlug ?? defaultFetchClientGroupByUrlSlug

  const session = await getSession(request)
  if (!session?.user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "unauthorised" }, { status: 401 }),
    }
  }

  const user = session.user as { email?: string }
  const roles = getUserRoles(user as Parameters<typeof getUserRoles>[0])
  // AuthZ: only admin is unscoped. Empty MBA on non-admin must not open the book
  // (SEC-G creative soft-spot + every checkClientMbaAccess consumer).
  if (roles.includes("admin")) {
    return { ok: true, isClient: false, allows: () => true, denyPath: "mba_numbers" }
  }

  const email = user.email
  const isClient = roles.includes("client")
  const slugs = getUserClientSlugs(user as Parameters<typeof getUserClientSlugs>[0])
  const slug = slugs[0] ?? null

  const mbaList = getUserMbaNumbers(user as Parameters<typeof getUserMbaNumbers>[0])
  if (mbaList.length > 0) {
    const normalized = new Set(mbaList.map((mba) => mba.toLowerCase()))
    return {
      ok: true,
      isClient,
      allows: (mbaNumber: string) => normalized.has(mbaNumber.toLowerCase()),
      denyPath: "mba_numbers",
      email,
      slug,
      slugs,
    }
  }

  // Non-client without mba_numbers: deny (no identifier fallback for staff-shaped sessions).
  if (!isClient) {
    console.warn("[checkClientMbaAccess] Non-admin session missing mba_numbers", {
      email,
    })
    return { ok: false, response: forbiddenResponse() }
  }

  if (slugs.length === 0) {
    console.warn("[checkClientMbaAccess] Client user missing client identifier", {
      email,
    })
    return { ok: false, response: forbiddenResponse(), denyPath: "no-row", email, slug: null, slugs: [] }
  }

  try {
    const identifiers: string[] = []
    for (const candidate of slugs) {
      const group = await fetchClientGroupByUrlSlug(candidate)
      const mbaidentifier = group?.mbaidentifier?.trim() || null
      if (mbaidentifier) identifiers.push(mbaidentifier)
    }
    if (identifiers.length === 0) {
      console.warn("[checkClientMbaAccess] Client row missing mbaidentifier", {
        email,
        userClientSlug: slug,
        slugs,
      })
      return { ok: false, response: forbiddenResponse(), denyPath: "no-row", email, slug, slugs }
    }

    return {
      ok: true,
      isClient: true,
      allows: (mbaNumber: string) =>
        identifiers.some((mbaidentifier) =>
          mbaNumberMatchesClientIdentifier(mbaNumber, mbaidentifier),
        ),
      denyPath: "identifier",
      email,
      slug,
      slugs,
    }
  } catch (err) {
    console.warn("[checkClientMbaAccess] Failed to resolve client row for MBA access check", {
      email,
      userClientSlug: slug,
      slugs,
      err,
    })
    return { ok: false, response: forbiddenResponse(), denyPath: "no-row", email, slug, slugs }
  }
}

export async function checkClientMbaAccess(
  request: NextRequest,
  mbaNumber: string,
  deps: CheckClientMbaAccessDeps = {}
): Promise<ClientMbaAccess> {
  const scope = await resolveClientMbaScope(request, deps)
  if (!scope.ok) {
    if (scope.denyPath) {
      logAccessDeny({
        email: scope.email,
        slug: scope.slug,
        slugs: scope.slugs,
        mba: mbaNumber,
        path: scope.denyPath,
      })
    }
    return scope
  }

  if (scope.allows(mbaNumber)) {
    return { ok: true, isClient: scope.isClient }
  }

  logAccessDeny({
    email: scope.email,
    slug: scope.slug,
    slugs: scope.slugs,
    mba: mbaNumber,
    path: scope.denyPath,
  })

  return { ok: false, response: forbiddenResponse() }
}
