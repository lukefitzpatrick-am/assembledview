"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { PacingFilterToolbar } from "@/components/pacing/PacingFilterToolbar"

const tabs = [
  { href: "/pacing/overview", label: "Overview" },
  { href: "/pacing/settings", label: "Settings" },
]

interface PacingShellProps {
  children: ReactNode
}

export function PacingShell({ children }: PacingShellProps) {
  const pathname = usePathname() ?? ""

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-4 px-4 pb-12 pt-4 md:px-6">
      {/* Sticky filter toolbar */}
      <div className="sticky top-0 z-20 -mx-4 border-b border-border/50 bg-background/95 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:-mx-6 md:px-6">
        <PacingFilterToolbar />
      </div>

      {/* Page hero */}
      <header className="space-y-0.5">
        <h1 className="text-2xl font-semibold tracking-tight">Pacing</h1>
        <p className="text-sm text-muted-foreground">
          Portfolio pacing across all clients in your scope.
        </p>
      </header>

      {/* Top tabs */}
      <nav
        role="tablist"
        aria-label="Pacing sections"
        className="-mt-1 flex border-b border-border/60"
      >
        {tabs.map(({ href, label }) => {
          const active =
            pathname === href || pathname.startsWith(`${href}/`)
          return (
            <Link
              key={href}
              href={href}
              role="tab"
              aria-selected={active}
              className={cn(
                "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                active
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Tab content */}
      <div className="mt-4">{children}</div>
    </div>
  )
}
