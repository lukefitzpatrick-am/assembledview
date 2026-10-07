"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { navChipClass } from "@/components/layout/navChip"
import { PageHeader } from "@/components/layout/PageHeader"
import { AvaPacingCommentaryAction } from "@/components/ava/AvaSkillActionSets"
import { PacingFilterToolbar } from "@/components/pacing/PacingFilterToolbar"

const baseTabs = [
  { href: "/pacing/portfolio", label: "Portfolio" },
  { href: "/pacing/overview", label: "Overview" },
  { href: "/pacing/search", label: "Search" },
  { href: "/pacing/social", label: "Social" },
  { href: "/pacing/programmatic", label: "Programmatic" },
  { href: "/pacing/ad-serving", label: "Ad Serving" },
  { href: "/pacing/direct", label: "Direct" },
] as const

interface PacingShellProps {
  children: ReactNode
  isAdmin?: boolean
  canRelabel?: boolean
}

export function PacingShell({ children, isAdmin = false, canRelabel = false }: PacingShellProps) {
  const pathname = usePathname() ?? ""
  const tabs = [
    ...baseTabs,
    ...(isAdmin ? [{ href: "/pacing/admin/orphans", label: "Orphans" as const }] : []),
    ...(canRelabel ? [{ href: "/pacing/admin/relabels", label: "Relabels" as const }] : []),
  ]

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-4 px-4 pb-12 pt-4 md:px-6">
      {/* Sticky filter toolbar */}
      <div className="sticky top-0 z-20 -mx-4 border-b border-border/50 bg-background/95 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:-mx-6 md:px-6">
        <PacingFilterToolbar />
      </div>

      <PageHeader
        title="Pacing"
        lede="Portfolio pacing across all clients and channels in your scope (Search, Social, Programmatic, Ad Serving, Direct)."
        actions={<AvaPacingCommentaryAction />}
      />

      {/* Top tabs */}
      <nav
        role="tablist"
        aria-label="Pacing sections"
        className="flex flex-wrap gap-2"
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
              className={navChipClass(active)}
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
