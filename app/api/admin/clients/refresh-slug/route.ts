import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import axios from "axios"
import { requireAdmin } from "@/lib/requireRole"
import {
  listAuth0UsersByClientSlug,
  updateAuth0UserMetadata,
} from "@/lib/api/auth0Management"
import { getClientDisplayName, slugifyClientNameForUrl } from "@/lib/clients/slug"

export const runtime = "nodejs"

const DEFAULT_CLIENTS_BASE_URL = "https://xg4h-uyzs-dtex.a2.xano.io/api:9v_k2NR8"
const clientsBaseUrl = (
  process.env.XANO_CLIENTS_BASE_URL ||
  process.env.XANO_BASE_URL ||
  DEFAULT_CLIENTS_BASE_URL
).replace(/\/$/, "")
const clientsUrl = `${clientsBaseUrl}/clients`

const ADMIN_ALLOWLIST = (process.env.ADMIN_EMAIL_ALLOWLIST || "")
  .split(",")
  .map((entry) => entry.trim().toLowerCase())
  .filter(Boolean)

const payloadSchema = z.object({
  oldSlug: z.string().trim().min(1),
  clientId: z.coerce.number().int().positive(),
})

async function fetchLatestClients(): Promise<any[]> {
  const timeoutMs = Number(process.env.XANO_TIMEOUT_MS ?? 5000)
  const res = await axios.get(clientsUrl, { timeout: timeoutMs })
  return Array.isArray(res.data) ? res.data : []
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await requireAdmin(request, { allowEmails: ADMIN_ALLOWLIST })
    if ("response" in sessionResult) return sessionResult.response

    const json = await request.json()
    const parsed = payloadSchema.safeParse(json)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const oldSlug = parsed.data.oldSlug.trim().toLowerCase()
    const clientId = parsed.data.clientId

    const clients = await fetchLatestClients()
    const client = clients.find((c: any) => Number(c?.id) === clientId) ?? null
    if (!client) {
      return NextResponse.json(
        { error: "Client not found", clientId },
        { status: 404 }
      )
    }

    const clientName = getClientDisplayName(client)
    const newSlug = slugifyClientNameForUrl(clientName)
    if (!newSlug) {
      return NextResponse.json(
        { error: "Client has no valid name to slugify", clientId, clientName },
        { status: 400 }
      )
    }

    const users = await listAuth0UsersByClientSlug(oldSlug)

    const updatedUserIds: string[] = []
    const failed: Array<{ userId: string; error: string }> = []

    for (const user of users) {
      const userId = String(user.user_id ?? "")
      if (!userId) continue

      const appMetadataRaw = (user.app_metadata ?? {}) as Record<string, unknown>
      const nextAppMetadata: Record<string, unknown> = {
        ...appMetadataRaw,
        client_slug: newSlug,
      }

      try {
        await updateAuth0UserMetadata({ userId, app_metadata: nextAppMetadata })
        updatedUserIds.push(userId)
      } catch (err) {
        failed.push({
          userId,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    return NextResponse.json({
      ok: true,
      clientId,
      clientName,
      oldSlug,
      newSlug,
      matchedUsers: users.length,
      updatedUsers: updatedUserIds.length,
      updatedUserIds,
      failed,
    })
  } catch (error) {
    console.error("[admin/clients/refresh-slug] failed", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}

