import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth0 } from "@/lib/auth0"
import type { PacingSavedView } from "@/lib/xano/pacing-types"

async function defaultSavedViewIdFromRequest(): Promise<string | null> {
  try {
    const h = await headers()
    const proto = h.get("x-forwarded-proto") ?? "http"
    const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000"
    const cookie = h.get("cookie") ?? ""
    const res = await fetch(`${proto}://${host}/api/pacing/saved-views`, {
      cache: "no-store",
      headers: { cookie },
    })
    if (!res.ok) return null
    const json = (await res.json()) as { data?: PacingSavedView[] }
    const rows = Array.isArray(json.data) ? json.data : []
    const def = rows.find((v) => v.is_default)
    return def ? String(def.id) : null
  } catch {
    return null
  }
}

export default async function PacingIndexPage() {
  const session = await auth0.getSession()
  if (!session?.user) {
    redirect("/auth/login?returnTo=/pacing")
  }

  const viewId = await defaultSavedViewIdFromRequest()
  if (viewId) {
    redirect(`/pacing/overview?view=${encodeURIComponent(viewId)}`)
  }
  redirect("/pacing/overview")
}
