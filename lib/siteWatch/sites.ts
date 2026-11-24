/** Turning `clients.website` values into Site Watch sites (gate D4: one site per website). */

export type ClientWebsite = { id: number; name: string | null; website: string | null }
export type NewSite = { clientId: number; label: string; baseUrl: string; urlPrefix: string | null }

/**
 * The part of the site a scan covers: sitemap URLs must sit under this path.
 * `/en-au/home` covers `/en-au/`, `/au/en/home.html` covers `/au/en/`, a
 * single segment such as `/en-au` covers `/en-au/`, a path ending in `/`
 * covers itself, and the root covers the whole host (null).
 */
export function urlPrefixFor(pathname: string): string | null {
  if (pathname === "/" || pathname === "") return null
  if (pathname.endsWith("/")) return pathname
  const segs = pathname.split("/").filter(Boolean)
  if (segs.length === 1 && !segs[0]!.includes(".")) return `/${segs[0]}/`
  return segs.length > 1 ? `/${segs.slice(0, -1).join("/")}/` : null
}

/** One site per website URL, owned by the lowest client id that has it. */
export function sitesFromClients(rows: readonly ClientWebsite[]): NewSite[] {
  const byUrl = new Map<string, NewSite>()
  for (const r of [...rows].sort((a, b) => a.id - b.id)) {
    let u: URL
    try {
      u = new URL((r.website ?? "").trim())
    } catch {
      continue
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") continue
    u.hash = ""
    u.search = ""
    const baseUrl = u.toString()
    const key = baseUrl.toLowerCase()
    if (!byUrl.has(key)) {
      byUrl.set(key, { clientId: r.id, label: r.name?.trim() || u.host, baseUrl, urlPrefix: urlPrefixFor(u.pathname) })
    }
  }
  return [...byUrl.values()]
}
