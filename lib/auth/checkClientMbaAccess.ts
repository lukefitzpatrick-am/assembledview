import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { apiClient } from "@/lib/api"
import {
  getXanoClientsCollectionUrl,
  parseXanoListPayload,
  xanoAuthHeaderRecord,
} from "@/lib/api/xano"
import { getPrimaryRole, getUserClientIdentifier } from "@/lib/rbac"
import { mbaNumberMatchesClientIdentifier } from "@/lib/auth/mbaNumberMatchesClientIdentifier"
import { resolveClientGroup } from "@/lib/clients/clientGroup"

/**
 * For role=client: verify the request's mba_number belongs to the user's client.
 * Looks up client.mbaidentifier from Xano; MBA must equal identifier or match
 * identifier + trailing digits (e.g. PENFOLD001).
 * Returns a 403 NextResponse if denied, or null if allowed (or not a client / no mba).
 */
export async function checkClientMbaAccess(
  request: NextRequest,
  user: Record<string, unknown> | null | undefined,
  mbaNumber: string | null | undefined
): Promise<NextResponse | null> {
  if (getPrimaryRole(user) !== "client") return null
  if (!mbaNumber || typeof mbaNumber !== "string") return null

  const clientSlug = getUserClientIdentifier(user)
  if (!clientSlug) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    const clientsUrl = getXanoClientsCollectionUrl()
    const clientsResponse = await apiClient.get(clientsUrl, {
      headers: xanoAuthHeaderRecord(),
    })
    const clients = parseXanoListPayload(clientsResponse.data)
    // Prefer group resolution so mbaidentifier-slugs (penfold) and name-slugs
    // (penfolds) share the same mbaidentifier from the group anchor.
    const group = resolveClientGroup(clients, clientSlug)
    const client = group
      ? group.anchor
      : clients.find(
          (c: { name?: string; client_name?: string; url_slug?: string }) => {
            const name = (c.name || c.client_name || "").toString().toLowerCase()
            const urlSlug = (c.url_slug || "").toString().toLowerCase()
            const slugLower = clientSlug.toLowerCase()
            return name.includes(slugLower) || urlSlug === slugLower
          }
        )

    if (!client) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const mbaidentifier =
      (client as { mbaidentifier?: string }).mbaidentifier ??
      (client as { mba_identifier?: string }).mba_identifier ??
      null
    // Exact match preferred; fallback requires identifier + ONE OR MORE trailing
    // digits (PENFOLD001). Bare startsWith is rejected (see mbaNumberMatchesClientIdentifier).
    const allowed =
      mbaNumber === mbaidentifier ||
      mbaNumberMatchesClientIdentifier(mbaNumber, mbaidentifier)

    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  return null
}
