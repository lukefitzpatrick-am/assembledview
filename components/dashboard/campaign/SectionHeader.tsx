"use client"

import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

export interface SectionHeaderProps {
  title: string
  description?: string
  badge?: ReactNode
  actions?: ReactNode
  className?: string
}

export function SectionHeader({
  title,
  description,
  badge,
  actions,
  className,
}: SectionHeaderProps) {
  return (
    <header className={cn("flex flex-wrap items-start justify-between gap-3", className)}>
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold tracking-tight text-foreground">{title}</h2>
          {badge}
        </div>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </header>
  )
}
