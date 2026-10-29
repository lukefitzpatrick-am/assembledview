/**
 * Browser calls for View as client. Both use a full page load afterwards
 * (`window.location.assign`), never `router.push`, so SWR / coalesced /
 * router caches holding admin data are dropped on enter and exit.
 */

export type StartViewAsResult = { ok: true; redirect: string } | { ok: false; message: string }

export async function startViewAs(slug: string, minutes: number): Promise<StartViewAsResult> {
  try {
    const res = await fetch("/api/admin/view-as", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      cache: "no-store",
      body: JSON.stringify({ slug, minutes }),
    })
    const body = (await res.json().catch(() => null)) as { redirect?: string; message?: string; error?: string } | null
    if (!res.ok || !body?.redirect) {
      return { ok: false, message: body?.message || body?.error || `Could not start client view (${res.status}).` }
    }
    return { ok: true, redirect: body.redirect }
  } catch {
    return { ok: false, message: "Could not start client view." }
  }
}

export async function exitViewAs(reason?: "expired"): Promise<string> {
  try {
    const res = await fetch("/api/view-as/exit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      cache: "no-store",
      body: JSON.stringify(reason ? { reason } : {}),
    })
    const body = (await res.json().catch(() => null)) as { redirect?: string } | null
    return body?.redirect || "/client"
  } catch {
    return "/client"
  }
}

/** "3:45 pm" in the viewer's local time. */
export function formatViewAsEnd(expSeconds: number): string {
  return new Intl.DateTimeFormat("en-AU", { hour: "numeric", minute: "2-digit" }).format(new Date(expSeconds * 1000))
}

export function viewAsBannerText(clientName: string, expSeconds: number): string {
  return `Viewing as ${clientName} (client view, read-only). Ends ${formatViewAsEnd(expSeconds)}.`
}
