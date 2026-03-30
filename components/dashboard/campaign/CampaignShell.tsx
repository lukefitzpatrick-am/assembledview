"use client"

import type { CSSProperties, ReactNode } from "react"

import { cn } from "@/lib/utils"

type CampaignShellProps = {
  children: ReactNode
  brandColour?: string
  className?: string
}

type BrandStyle = CSSProperties & {
  "--brand-color"?: string
}

export function CampaignShell({ children, brandColour, className }: CampaignShellProps) {
  const style: BrandStyle = {
    "--brand-color": brandColour,
    backgroundImage: brandColour
      ? `linear-gradient(180deg, color-mix(in srgb, var(--brand-color) 8%, transparent) 0%, transparent 24%)`
      : undefined,
  }

  return (
    <div
      className={cn("rounded-2xl border border-border bg-card", className)}
      style={style}
    >
      {children}
    </div>
  )
}
