"use client"

import Link from "next/link"
import type { ReactNode } from "react"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export interface SectionHeaderProps {
  title: string
  badge?: ReactNode
  count?: number
  actionLabel?: string
  actionHref?: string
  className?: string
}

export function SectionHeader({
  title,
  badge,
  count,
  actionLabel,
  actionHref,
  className,
}: SectionHeaderProps) {
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-3", className)}>
      <div className="flex min-w-0 items-center gap-2">
        <h2 className="truncate text-lg font-semibold text-foreground">{title}</h2>
        {badge}
        {typeof count === "number" ? <Badge variant="info" size="sm">{count.toLocaleString("en-US")}</Badge> : null}
      </div>
      {actionLabel && actionHref ? (
        <Link
          href={actionHref}
          className="text-sm text-primary transition-transform hover:scale-[1.02] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {actionLabel}
        </Link>
      ) : null}
    </div>
  )
}
