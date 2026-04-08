import "server-only"

import axios from "axios"
import { xanoUrl } from "@/lib/api/xano"
import { getAuth0UserById } from "@/lib/api/auth0Management"
import { resolvePacingTenantNumericIdsFromAuth0LikeUser } from "@/lib/pacing/pacingAuth"

export type PacingAlertRecipient = {
  email: string
  first_name: string | null
  allowedClientIds: number[] | null
}

async function fetchXanoUserRow(users_id: number): Promise<Record<string, unknown> | null> {
  try {
    const url = xanoUrl(`user/${users_id}`, "XANO_CLIENTS_BASE_URL")
    const { data } = await axios.get<unknown>(url, { timeout: 12_000 })
    if (Array.isArray(data)) return (data[0] as Record<string, unknown>) ?? null
    if (data && typeof data === "object") {
      const o = data as Record<string, unknown>
      if (o.data && typeof o.data === "object") {
        const inner = o.data
        if (Array.isArray(inner)) return (inner[0] as Record<string, unknown>) ?? null
        return inner as Record<string, unknown>
      }
    }
    return data as Record<string, unknown>
  } catch {
    return null
  }
}

function pickAuth0Id(row: Record<string, unknown> | null): string | null {
  if (!row) return null
  const keys = ["auth0_user_id", "auth0_id", "auth0_sub", "external_id", "user_id"] as const
  for (const k of keys) {
    const v = row[k]
    if (typeof v === "string" && v.includes("|")) return v.trim()
  }
  return null
}

/**
 * Resolves email + optional tenant scope for a Xano `users_id` (pacing_alert_subscriptions.users_id).
 */
export async function resolvePacingAlertRecipient(users_id: number): Promise<PacingAlertRecipient | null> {
  const row = await fetchXanoUserRow(users_id)
  let email = String(row?.email ?? "").trim()
  let first_name: string | null =
    typeof row?.first_name === "string" && row.first_name.trim()
      ? row.first_name.trim()
      : typeof row?.given_name === "string" && row.given_name.trim()
        ? row.given_name.trim()
        : null

  const auth0Id = pickAuth0Id(row)
  let allowedClientIds: number[] | null = null

  if (auth0Id) {
    const profile = await getAuth0UserById(auth0Id)
    if (profile) {
      if (!email && typeof profile.email === "string") email = profile.email.trim()
      if (!first_name && typeof profile.given_name === "string" && profile.given_name.trim()) {
        first_name = profile.given_name.trim()
      }
      allowedClientIds = await resolvePacingTenantNumericIdsFromAuth0LikeUser({
        app_metadata: profile.app_metadata,
        user_metadata: profile.user_metadata,
      })
    }
  }

  if (!email) return null

  return { email, first_name, allowedClientIds }
}
