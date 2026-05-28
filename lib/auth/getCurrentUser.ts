import "server-only"

import axios from "axios"
import type { NextRequest } from "next/server"
import { auth0 } from "@/lib/auth0"
import { parseXanoListPayload } from "@/lib/api/xano"
import { xanoUrl } from "@/lib/api/xano"

export type CurrentUser = {
  id: number
  name?: string | null
  email?: string | null
}

const AUTH0_ID_KEYS = ["auth0_user_id", "auth0_id", "auth0_sub", "external_id", "user_id"] as const

function pickNumericUsersId(source: Record<string, unknown>): number | null {
  for (const key of ["users_id", "xano_users_id"]) {
    const n = Number(source[key])
    if (Number.isFinite(n) && n > 0) return n
  }
  const appMeta = source.app_metadata
  if (appMeta && typeof appMeta === "object") {
    const meta = appMeta as Record<string, unknown>
    const n = Number(meta.users_id ?? meta.xano_users_id)
    if (Number.isFinite(n) && n > 0) return n
  }
  return null
}

function auth0SubMatches(row: Record<string, unknown>, sub: string): boolean {
  for (const k of AUTH0_ID_KEYS) {
    if (String(row[k] ?? "").trim() === sub) return true
  }
  return false
}

/**
 * Resolves the authenticated caller to a Xano `users` row id for audit fields.
 * Returns null when unauthenticated or when no matching Xano user exists.
 */
export async function getCurrentUser(request: NextRequest | Request): Promise<CurrentUser | null> {
  const session = await auth0.getSession(request as NextRequest)
  if (!session?.user) return null

  const user = session.user as Record<string, unknown>
  const directId = pickNumericUsersId(user)
  if (directId != null) {
    return {
      id: directId,
      name: typeof user.name === "string" ? user.name : null,
      email: typeof user.email === "string" ? user.email : null,
    }
  }

  const sub = typeof user.sub === "string" ? user.sub.trim() : ""
  if (!sub) return null

  try {
    const url = xanoUrl("user", "XANO_CLIENTS_BASE_URL")
    const response = await axios.get(url, { timeout: 12_000 })
    const rows = parseXanoListPayload(response.data) as Record<string, unknown>[]
    const match = rows.find((row) => auth0SubMatches(row, sub))
    if (!match) return null

    const id = Number(match.id)
    if (!Number.isFinite(id) || id <= 0) return null

    const name =
      typeof match.name === "string" && match.name.trim()
        ? match.name.trim()
        : typeof match.first_name === "string" && match.first_name.trim()
          ? match.first_name.trim()
          : typeof user.name === "string"
            ? user.name
            : null

    return {
      id,
      name,
      email:
        typeof match.email === "string" && match.email.trim()
          ? match.email.trim()
          : typeof user.email === "string"
            ? user.email
            : null,
    }
  } catch (error) {
    console.error("[getCurrentUser] Xano user lookup failed", {
      message: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}
