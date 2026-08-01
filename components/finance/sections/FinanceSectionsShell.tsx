"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Panel, PanelContent, PanelHeader, PanelTitle } from "@/components/layout/Panel"
import { cn } from "@/lib/utils"
import { FINANCE_SECTION_PILL_ITEMS } from "@/lib/finance/sections/nav"

function normalizePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) return pathname.slice(0, -1)
  return pathname
}

function pillActive(pathname: string, href: string): boolean {
  const p = normalizePath(pathname)
  const h = normalizePath(href)
  if (h === "/finance") return p === "/finance" || p === "/finance/home"
  if (h === "/finance/costs") {
    return p === "/finance/costs" || p.startsWith("/finance/costs/")
  }
  return p === h || p.startsWith(`${h}/`)
}

export function FinanceSectionsShell({
  title,
  children,
  scopeBar,
}: {
  title: string
  children: React.ReactNode
  scopeBar?: React.ReactNode
}) {
  const pathname = usePathname() ?? ""

  return (
    <div className="w-full max-w-none px-4 pb-10 pt-4 md:px-6">
      <div className="mb-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
          <span className="rounded-pill border border-border bg-surface-panel px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            sections
          </span>
        </div>
        <nav aria-label="Finance sections" className="flex flex-wrap gap-1.5">
          {FINANCE_SECTION_PILL_ITEMS.map((item) => {
            const active = pillActive(pathname, item.path)
            return (
              <Link
                key={item.path}
                href={item.path}
                className={cn(
                  "interactive-tint rounded-pill border px-3 py-1 text-xs font-medium transition-colors",
                  active
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border bg-card text-muted-foreground hover:text-foreground"
                )}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>
        {scopeBar ? (
          <div className="rounded-card border border-border bg-surface-panel px-3 py-2">
            {scopeBar}
          </div>
        ) : (
          <div className="rounded-card border border-dashed border-border bg-surface-panel px-3 py-2 text-xs text-muted-foreground">
            Shared scope bar (FY / months / clients) — slot reserved for later FN work.
          </div>
        )}
      </div>
      {children}
    </div>
  )
}

export function FinanceSectionPlaceholderCard({
  title,
  body,
}: {
  title: string
  body: string
}) {
  return (
    <Panel>
      <PanelHeader>
        <PanelTitle>{title}</PanelTitle>
      </PanelHeader>
      <PanelContent>
        <p className="text-sm text-muted-foreground">{body}</p>
      </PanelContent>
    </Panel>
  )
}
