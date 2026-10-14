export type ClientMenuKind = "client" | "creative" | "web" | "knowledge"

export type ClientMenuItem = {
  title: string
  href: string
  kind: ClientMenuKind
  slug?: string
  isActive: boolean
}

const BOTTOM_NAV_CLIENT_CAP = 3

export function formatClientSlugLabel(slug: string): string {
  const s = String(slug ?? "").trim()
  if (!s) return ""
  return s
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ")
}

function pathMatchesHref(pathname: string, href: string): boolean {
  const p = pathname.endsWith("/") && pathname.length > 1 ? pathname.slice(0, -1) : pathname
  const h = href.endsWith("/") && href.length > 1 ? href.slice(0, -1) : href
  return p === h || p.startsWith(`${h}/`)
}

/** URL dashboard segment when it is in `clientSlugs`; otherwise the primary. */
export function resolveActiveClientSlug(pathname: string, clientSlugs: string[]): string | null {
  const primary = clientSlugs[0] ?? null
  if (!primary) return null
  const match = pathname.match(/^\/dashboard\/([^/]+)/)
  const segment = match?.[1] ? decodeURIComponent(match[1]).toLowerCase() : ""
  if (!segment) return primary
  return clientSlugs.find((s) => s.toLowerCase() === segment) ?? primary
}

export function buildClientMenuItems(opts: {
  clientSlugs: string[]
  labels: Record<string, string>
  pathname: string
  creativeLabel: string
  knowledgeLabel: string
  /** Slugs whose Web & search tab is on. Omitted means the tab stays hidden. */
  webSearchSlugs?: string[]
}): ClientMenuItem[] {
  const { clientSlugs, labels, pathname, creativeLabel, knowledgeLabel, webSearchSlugs = [] } = opts
  const items: ClientMenuItem[] = []
  const activeSlug = resolveActiveClientSlug(pathname, clientSlugs)

  for (const slug of clientSlugs) {
    const href = `/dashboard/${slug}`
    const named = labels[slug]?.trim()
    items.push({
      title: named || formatClientSlugLabel(slug) || slug.toUpperCase(),
      href,
      kind: "client",
      slug,
      isActive: pathMatchesHref(pathname, href),
    })
  }

  if (activeSlug) {
    const href = `/dashboard/${activeSlug}/creative`
    items.push({
      title: creativeLabel,
      href,
      kind: "creative",
      isActive: pathMatchesHref(pathname, href),
    })
    const webOn = webSearchSlugs.some((slug) => slug.toLowerCase() === activeSlug.toLowerCase())
    if (webOn) {
      const webHref = `/dashboard/${activeSlug}/web`
      items.push({
        title: "Web & search",
        href: webHref,
        kind: "web",
        slug: activeSlug,
        isActive: pathMatchesHref(pathname, webHref),
      })
    }
  }

  items.push({
    title: knowledgeLabel,
    href: "/knowledge",
    kind: "knowledge",
    isActive: pathMatchesHref(pathname, "/knowledge"),
  })

  return items
}

/**
 * Bottom nav is a 5-slot grid. Cap client rows at 3 so Creative and Knowledge
 * Hub never fall off. Extra slugs remain in the desktop sidebar only.
 */
export function clientBottomNavItems(items: ClientMenuItem[]): ClientMenuItem[] {
  const clients = items.filter((i) => i.kind === "client")
  const rest = items.filter((i) => i.kind !== "client")
  const cap = rest.some((item) => item.kind === "web") ? BOTTOM_NAV_CLIENT_CAP - 1 : BOTTOM_NAV_CLIENT_CAP
  return [...clients.slice(0, cap), ...rest]
}
