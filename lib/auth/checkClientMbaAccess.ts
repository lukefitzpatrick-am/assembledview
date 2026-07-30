import { NextRequest, NextResponse } from "next/server"
import { auth0 } from "@/lib/auth0"
import { getUserRoles, getUserClientIdentifier, getUserMbaNumbers } from "@/lib/rbac"
import { fetchXanoClientRowByUrlSlug } from "@/lib/clients/fetchClientRowByUrlSlug"
import { mbaNumberMatchesClientIdentifier } from "@/lib/auth/mbaNumberMatchesClientIdentifier"

export type ClientMbaAccess =
  | { ok: true; isClient: boolean }
  | { ok: false; response: NextResponse }

export type ClientMbaScope =
  | { ok: false; response: NextResponse }
  | {
      ok: true
      isClient: boolean
      /** True when the caller may access this MBA number. */
      allows: (mbaNumber: string) => boolean
    }

function forbiddenResponse(): NextResponse {
  return NextResponse.json({ error: "forbidden" }, { status: 403 })
}

/**
 * Resolve the caller's MBA scope once (staff = unrestricted; client = mba_numbers
 * list or mbaidentifier prefix matcher). Prefer this for list endpoints so the
 * Xano client-row lookup is not repeated per row.
 *
 * Primary path: `app_metadata.mba_numbers` (exact membership).
 * Fallback: `mbaNumberMatchesClientIdentifier` against the client's `mbaidentifier`.
 */
export async function resolveClientMbaScope(
  request: NextRequest
): Promise<ClientMbaScope> {
  const session = await auth0.getSession(request)
  if (!session?.user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "unauthorised" }, { status: 401 }),
    }
  }

  const roles = getUserRoles(session.user)
  if (!roles.includes("client")) {
    return { ok: true, isClient: false, allows: () => true }
  }

  const email = (session.user as { email?: string }).email

  const mbaList = getUserMbaNumbers(session.user)
  if (mbaList.length > 0) {
    const normalized = new Set(mbaList.map((mba) => mba.toLowerCase()))
    return {
      ok: true,
      isClient: true,
      allows: (mbaNumber: string) => normalized.has(mbaNumber.toLowerCase()),
    }
  }

  const slug = getUserClientIdentifier(session.user)
  if (!slug) {
    console.warn("[checkClientMbaAccess] Client user missing client identifier", {
      email,
    })
    return { ok: false, response: forbiddenResponse() }
  }

  try {
    const row = await fetchXanoClientRowByUrlSlug(slug)
    const mbaidentifier =
      typeof row?.mbaidentifier === "string" ? row.mbaidentifier.trim() : null
    if (!mbaidentifier) {
      console.warn("[checkClientMbaAccess] Client row missing mbaidentifier", {
        email,
        userClientSlug: slug,
      })
      return { ok: false, response: forbiddenResponse() }
    }

    return {
      ok: true,
      isClient: true,
      allows: (mbaNumber: string) =>
        mbaNumberMatchesClientIdentifier(mbaNumber, mbaidentifier),
    }
  } catch (err) {
    console.warn("[checkClientMbaAccess] Failed to resolve client row for MBA access check", {
      email,
      userClientSlug: slug,
      err,
    })
    return { ok: false, response: forbiddenResponse() }
  }
}

export async function checkClientMbaAccess(
  request: NextRequest,
  mbaNumber: string
): Promise<ClientMbaAccess> {
  const scope = await resolveClientMbaScope(request)
  if (!scope.ok) return scope

  if (scope.allows(mbaNumber)) {
    return { ok: true, isClient: scope.isClient }
  }

  if (scope.isClient) {
    console.warn("[checkClientMbaAccess] MBA number not in caller scope", {
      requestedMba: mbaNumber,
    })
  }

  return { ok: false, response: forbiddenResponse() }
}
