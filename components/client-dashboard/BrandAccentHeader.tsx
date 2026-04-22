"use client"

import type { ReactNode } from "react"

import {
  PanelActions,
  PanelDescription,
  PanelHeader,
  PanelTitle,
} from "@/components/layout/Panel"
import { cn } from "@/lib/utils"

export type BrandAccentHeaderProps = {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  className?: string
}

export function BrandAccentHeader({ title, description, actions, className }: BrandAccentHeaderProps) {
  return (
    <PanelHeader className={cn(className)}>
      <div className="flex min-w-0 flex-1 items-stretch gap-3">
        <div
          className="w-1 shrink-0 self-stretch rounded-full"
          style={{ backgroundColor: "var(--brand-primary)" }}
          aria-hidden
        />
        <div className="min-w-0 flex-1 space-y-1.5">
          <PanelTitle>{title}</PanelTitle>
          {description ? <PanelDescription>{description}</PanelDescription> : null}
        </div>
      </div>
      {actions ? <PanelActions>{actions}</PanelActions> : null}
    </PanelHeader>
  )
}
