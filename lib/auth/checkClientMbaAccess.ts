import { NextRequest, NextResponse } from "next/server"
import { auth0 } from "@/lib/auth0"
import { getUserRoles, getUserClientIdentifier, getUserMbaNumbers } from "@/lib/rbac"
import { fetchXanoClientRowByUrlSlug } from "@/lib/clients/fetchClientRowByUrlSlug"

export type ClientMbaAccess =
  | { ok: true; isClient: boolean }
  | { ok: false; response: NextResponse }

function forbiddenResponse(): NextResponse {
  return NextResponse.json({ error: "forbidden" }, { status: 403 })
}

export async function checkClientMbaAccess(
  request: NextRequest,
  mbaNumber: string
): Promise<ClientMbaAccess> {
  const session = await auth0.getSession(request)
  if (!session?.user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "unauthorised" }, { status: 401 }),
    }
  }

  const roles = getUserRoles(session.user)
  if (!roles.includes("client")) {
    return { ok: true, isClient: false }
  }

  const email = (session.user as { email?: string }).email

  const mbaList = getUserMbaNumbers(session.user)
  if (mbaList.length > 0) {
    const mbaMatches = mbaList.some(
      (mba) => mba.toLowerCase() === mbaNumber.toLowerCase()
    )
    if (mbaMatches) {
      return { ok: true, isClient: true }
    }
    console.warn("[checkClientMbaAccess] MBA number not assigned to user", {
      email,
      requestedMba: mbaNumber,
      assignedMbaNumbers: mbaList,
    })
    return { ok: false, response: forbiddenResponse() }
  }

  const slug = getUserClientIdentifier(session.user)
  if (!slug) {
    console.warn("[checkClientMbaAccess] Client user missing client identifier", {
      email,
      requestedMba: mbaNumber,
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
        requestedMba: mbaNumber,
      })
      return { ok: false, response: forbiddenResponse() }
    }

    if (mbaNumber.toLowerCase().startsWith(mbaidentifier.toLowerCase())) {
      return { ok: true, isClient: true }
    }

    console.warn("[checkClientMbaAccess] MBA number does not match client mbaidentifier", {
      email,
      userClientSlug: slug,
      mbaidentifier,
      requestedMba: mbaNumber,
    })
    return { ok: false, response: forbiddenResponse() }
  } catch (err) {
    console.warn("[checkClientMbaAccess] Failed to resolve client row for MBA access check", {
      email,
      userClientSlug: slug,
      requestedMba: mbaNumber,
      err,
    })
    return { ok: false, response: forbiddenResponse() }
  }
}
