"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { PageHeader } from "@/components/layout/PageHeader"
import { navChipClass } from "@/components/layout/navChip"
import { Panel, PanelContent, PanelHeader, PanelTitle } from "@/components/layout/Panel"
import { useFinancePeriodsFlag } from "@/components/finance/sections/FinancePeriodsFlagContext"
import { financeSectionPillsForPath } from "@/lib/finance/sections/nav"
import { financeHref } from "@/lib/finance/sections/financeHref"
import { useFinanceScopeApplied } from "@/lib/finance/sections/useFinanceScope"

function normalizePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) return pathname.slice(0, -1)
  return pathname
}

function pillActive(pathname: string, href: string): boolean {
  const p = normalizePath(pathname)
  const h = normalizePath(href)
  if (h === "/finance/xero") {
    return p === "/finance/xero" || p.startsWith("/finance/xero/")
  }
  return p === h || p.startsWith(`${h}/`)
}

export function FinanceSectionsShell({
  title,
  accent,
  headerNote,
  children,
  scopeBar,
  /** When false, render `scopeBar` as-is (toolbar owns its own card — FIN-2). Default wraps in a panel. */
  scopeBarFramed = true,
}: {
  title: string
  /** Serif phrase after the title. The full stop lands on this word. */
  accent?: string
  /** One-line basis note under the title. */
  headerNote?: string
  children: React.ReactNode
  scopeBar?: React.ReactNode
  scopeBarFramed?: boolean
}) {
  const pathname = usePathname() ?? ""
  const periodsEnabled = useFinancePeriodsFlag()
  const applied = useFinanceScopeApplied()
  const pills = financeSectionPillsForPath(pathname, { periodsEnabled })

  return (
    <div className="w-full max-w-none px-4 pb-10 pt-4 md:px-6">
      <div className="mb-4 space-y-3">
        <PageHeader title={title} accent={accent} lede={headerNote} />
        {pills.length > 0 ? (
          <nav aria-label="Clients billing sections" className="flex flex-wrap gap-2">
            {pills.map((item) => {
              const active = pillActive(pathname, item.path)
              return (
                <Link
                  key={item.path}
                  href={financeHref(item.path, applied)}
                  className={navChipClass(active)}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>
        ) : null}
        {scopeBar ? (
          scopeBarFramed ? (
            <div className="rounded-card border border-border bg-surface-panel px-3 py-2">
              {scopeBar}
            </div>
          ) : (
            scopeBar
          )
        ) : null}
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
