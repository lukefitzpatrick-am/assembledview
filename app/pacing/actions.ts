"use server"

import { auth0 } from "@/lib/auth0"
import { getUserRoles } from "@/lib/rbac"
import {
  createSavedPacingView,
  deleteSavedPacingView,
  listSavedPacingViews,
  type SavedPacingView,
  updateSavedPacingView,
} from "@/lib/xano/savedViews"

function requireAdmin(user: any) {
  const roles = getUserRoles(user)
  if (!roles.includes("admin")) {
    throw new Error("Unauthorized")
  }
}

export async function listSavedPacingViewsAction(): Promise<{ ok: true; views: SavedPacingView[] } | { ok: false; error: string }> {
  try {
    const session = await auth0.getSession()
    const user = session?.user
    if (!user) return { ok: false, error: "Unauthorized" }
    requireAdmin(user)
    const userId = String((user as any)?.sub ?? "")
    const views = await listSavedPacingViews(userId)
    return { ok: true, views }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function createSavedPacingViewAction(input: {
  name: string
  client_slugs: string[]
  defaultDateWindow: SavedPacingView["defaultDateWindow"]
}): Promise<{ ok: true; view: SavedPacingView } | { ok: false; error: string }> {
  try {
    const session = await auth0.getSession()
    const user = session?.user
    if (!user) return { ok: false, error: "Unauthorized" }
    requireAdmin(user)
    const userId = String((user as any)?.sub ?? "")

    const payload: Omit<SavedPacingView, "id"> = {
      user_id: userId,
      name: input.name,
      client_slugs: input.client_slugs,
      defaultDateWindow: input.defaultDateWindow,
    }

    const view = await createSavedPacingView(payload)
    return { ok: true, view }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function updateSavedPacingViewAction(
  id: number,
  patch: Partial<Omit<SavedPacingView, "id" | "user_id">>
): Promise<{ ok: true; view: SavedPacingView } | { ok: false; error: string }> {
  try {
    const session = await auth0.getSession()
    const user = session?.user
    if (!user) return { ok: false, error: "Unauthorized" }
    requireAdmin(user)
    const view = await updateSavedPacingView(id, patch)
    return { ok: true, view }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function deleteSavedPacingViewAction(
  id: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const session = await auth0.getSession()
    const user = session?.user
    if (!user) return { ok: false, error: "Unauthorized" }
    requireAdmin(user)
    await deleteSavedPacingView(id)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

