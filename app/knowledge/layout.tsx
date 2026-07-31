"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

const NAV = [
  { href: "/knowledge", label: "Overview", exact: true },
  { href: "/knowledge/definitions", label: "Glossary", matchPrefix: "/knowledge/definitions" },
  { href: "/knowledge/acronyms", label: "Acronyms", matchPrefix: "/knowledge/acronyms" },
  { href: "/knowledge/formulas", label: "Formulas", matchPrefix: "/knowledge/formulas" },
  { href: "/knowledge/calculators", label: "Calculators" },
  { href: "/knowledge/guides", label: "Guides", matchPrefix: "/knowledge/guides" },
  { href: "/knowledge/platforms", label: "Platforms", matchPrefix: "/knowledge/platforms" },
  { href: "/knowledge/resources", label: "Resources" },
  { href: "/knowledge/utm-builder", label: "UTM Builder" },
] as const

function isActive(
  pathname: string,
  item: (typeof NAV)[number]
): boolean {
  if ("exact" in item && item.exact) return pathname === item.href
  if ("matchPrefix" in item && item.matchPrefix) {
    return pathname === item.matchPrefix || pathname.startsWith(`${item.matchPrefix}/`)
  }
  return pathname === item.href || pathname.startsWith(`${item.href}/`)
}

export default function KnowledgeLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname() ?? ""

  return (
    <div className="flex h-full min-h-0 flex-col">
      <nav
        aria-label="Knowledge Hub"
        className="shrink-0 border-b border-border bg-card px-4 md:px-6"
      >
        <div className="flex flex-wrap items-center gap-1 py-2">
          {NAV.map((item) => {
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
                {item.label}
              </Link>
            )
          })}
        </div>
      </nav>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  )
}
