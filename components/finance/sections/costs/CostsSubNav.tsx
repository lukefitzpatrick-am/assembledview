"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { financeHref } from "@/lib/finance/sections/financeHref"
import { useFinanceScopeApplied } from "@/lib/finance/sections/useFinanceScope"

const ITEMS = [
  {
    href: "/finance/costs",
    label: "Overview",
    match: (p: string) => p === "/finance/costs",
  },
  {
    href: "/finance/costs/invoices",
    label: "Publisher invoices",
    match: (p: string) => p.startsWith("/finance/costs/invoices"),
  },
  {
    href: "/finance/costs/accruals",
    label: "Accruals",
    match: (p: string) => p.startsWith("/finance/costs/accruals"),
  },
  {
    href: "/finance/costs/client-pays",
    label: "Client-pays",
    match: (p: string) => p.startsWith("/finance/costs/client-pays"),
  },
] as const

export function CostsSubNav() {
  const pathname = usePathname() ?? ""
  const applied = useFinanceScopeApplied()
  return (
    <nav aria-label="Publishers sections" className="flex flex-wrap gap-1.5">
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
