"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { LayoutGrid, Link2, Settings } from "lucide-react"
import { cn } from "@/lib/utils"
import { PacingFilterToolbar } from "@/components/pacing/PacingFilterToolbar"

const links = [
  { href: "/pacing/overview", label: "Overview", icon: LayoutGrid },
  { href: "/pacing/mappings", label: "Mappings", icon: Link2 },
  { href: "/pacing/settings", label: "Settings", icon: Settings },
]

export function PacingShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? ""

  return (
    <div className="flex w-full bg-surface-muted">
      <aside className="hidden w-52 shrink-0 border-r border-border/60 bg-background md:block">
        <div className="sticky top-0 space-y-1 p-4 pt-6">
          <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Pacing
          </p>
          {links.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`)
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4 shrink-0 opacity-80" />
                {label}
              </Link>
            )
          })}
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <div className="sticky top-0 z-20 border-b border-border/50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <PacingFilterToolbar />
        </div>
        <div className="border-b border-border/40 bg-background px-3 py-2 md:hidden">
          <nav className="flex flex-wrap gap-2">
            {links.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  "rounded-md px-2 py-1 text-xs font-medium",
                  pathname === href || pathname.startsWith(`${href}/`)
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground"
                )}
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="px-4 pb-12 pt-6 md:px-6">{children}</div>
      </div>
    </div>
  )
}
