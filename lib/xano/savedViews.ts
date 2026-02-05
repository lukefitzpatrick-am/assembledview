import "server-only"

import { xanoPacingUrl } from "@/lib/xano/config"

export type SavedPacingView = {
  id: number
  user_id: string
  name: string
  client_slugs: string[]
  defaultDateWindow: "LAST_30" | "LAST_60" | "LAST_90" | "CAMPAIGN_DATES"
}

const XANO_API_KEY = process.env.XANO_API_KEY || ""

function getAuthHeaders() {
  return {
    "Content-Type": "application/json",
    ...(XANO_API_KEY ? { Authorization: `Bearer ${XANO_API_KEY}` } : {}),
  }
}

function normalizeView(raw: any): SavedPacingView {
  return {
    id: Number(raw?.id),
    user_id: String(raw?.user_id ?? raw?.userId ?? ""),
    name: String(raw?.name ?? ""),
    client_slugs: Array.isArray(raw?.client_slugs)
      ? raw.client_slugs.map((v: any) => String(v)).filter(Boolean)
      : [],
    defaultDateWindow: (String(raw?.defaultDateWindow ?? raw?.default_date_window ?? "LAST_60") as any),
  }
}

export async function listSavedPacingViews(userId: string): Promise<SavedPacingView[]> {
  // NOTE: endpoint name is stubbed; align with Xano model/route when created.
  const url = new URL(xanoPacingUrl("saved_pacing_views"))
  url.searchParams.set("user_id", userId)

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: getAuthHeaders(),
    cache: "no-store",
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`Failed to list saved pacing views (${res.status}): ${text.slice(0, 200)}`)
  }
  const data = await res.json()
  const rows = Array.isArray(data) ? data : Array.isArray((data as any)?.items) ? (data as any).items : []
  return rows.map(normalizeView)
}

export async function createSavedPacingView(payload: Omit<SavedPacingView, "id">): Promise<SavedPacingView> {
  const res = await fetch(xanoPacingUrl("saved_pacing_views"), {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
    cache: "no-store",
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`Failed to create saved pacing view (${res.status}): ${text.slice(0, 200)}`)
  }
  return normalizeView(await res.json())
}

export async function updateSavedPacingView(
  id: number,
  patch: Partial<Omit<SavedPacingView, "id" | "user_id">>
): Promise<SavedPacingView> {
  const res = await fetch(xanoPacingUrl(`saved_pacing_views/${id}`), {
    method: "PATCH",
    headers: getAuthHeaders(),
    body: JSON.stringify(patch),
    cache: "no-store",
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`Failed to update saved pacing view (${res.status}): ${text.slice(0, 200)}`)
  }
  return normalizeView(await res.json())
}

export async function deleteSavedPacingView(id: number): Promise<void> {
  const res = await fetch(xanoPacingUrl(`saved_pacing_views/${id}`), {
    method: "DELETE",
    headers: getAuthHeaders(),
    cache: "no-store",
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`Failed to delete saved pacing view (${res.status}): ${text.slice(0, 200)}`)
  }
}

