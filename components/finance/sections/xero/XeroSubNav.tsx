"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { financeHref } from "@/lib/finance/sections/financeHref"
import { useFinanceScopeApplied } from "@/lib/finance/sections/useFinanceScope"

const ITEMS = [
  { href: "/finance/xero", label: "Exceptions", match: (p: string) => p === "/finance/xero" },
  {
    href: "/finance/xero/matches",
    label: "Matches",
    match: (p: string) => p.startsWith("/finance/xero/matches"),
  },
] as const

export function XeroSubNav() {
  const pathname = usePathname() ?? ""
  const applied = useFinanceScopeApplied()
  return (
    <nav aria-label="Xero sections" className="flex flex-wrap gap-1.5">
      {ITEMS.map((item) => {
        const active = item.match(pathname)
        return (
          <Link
            key={item.href}
            href={financeHref(item.href, applied)}
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
  )
}
