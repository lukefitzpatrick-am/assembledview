"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { getRouteByExactPath } from "@/lib/nav/routeManifest"

const NAV_PATHS = [
  { href: "/knowledge", exact: true as const },
  { href: "/knowledge/definitions", matchPrefix: "/knowledge/definitions" },
  { href: "/knowledge/acronyms", matchPrefix: "/knowledge/acronyms" },
  { href: "/knowledge/formulas", matchPrefix: "/knowledge/formulas" },
  { href: "/knowledge/calculators" },
  { href: "/knowledge/guides", matchPrefix: "/knowledge/guides" },
  { href: "/knowledge/platforms", matchPrefix: "/knowledge/platforms" },
  { href: "/knowledge/resources" },
  { href: "/knowledge/utm-builder" },
] as const

function labelFor(href: string): string {
  if (href === "/knowledge") return "Overview"
  return getRouteByExactPath(href)?.label ?? href
}

function isActive(
  pathname: string,
  item: (typeof NAV_PATHS)[number]
): boolean {
  if ("exact" in item && item.exact) return pathname === item.href
  if ("matchPrefix" in item && item.matchPrefix) {
    return pathname === item.matchPrefix || pathname.startsWith(`${item.matchPrefix}/`)
  }
  return pathname === item.href || pathname.startsWith(`${item.href}/`)
}

export function KnowledgeSubnav() {
  const pathname = usePathname() ?? ""

  return (
    <nav
      aria-label="Knowledge Hub"
      className="shrink-0 border-b border-border bg-card px-4 md:px-6"
    >
      <div className="flex flex-wrap items-center gap-1 py-2">
        {NAV_PATHS.map((item) => {
          const active = isActive(pathname, item)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-pill px-3 py-1.5 text-xs font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
              aria-current={active ? "page" : undefined}
            >
              {labelFor(item.href)}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
