"use client"

import type { CSSProperties, ReactNode } from "react"

import { AccentBar } from "@/components/ui/accent-bar"
import { CornerDotCluster } from "@/components/ui/corner-dot-cluster"
import { WaveRibbon } from "@/components/ui/wave-ribbon"
import { cn } from "@/lib/utils"

type BrandStyle = CSSProperties & {
  "--brand-color"?: string
  "--brand-color-light"?: string
  "--brand-color-medium"?: string
}

export interface PageHeroShellProps {
  brandColour?: string
  className?: string
  children: ReactNode
}

export function PageHeroShell({
  brandColour = "var(--pacing-on-track)",
  className,
  children,
}: PageHeroShellProps) {
  const brandStyle: BrandStyle = {
    "--brand-color": brandColour,
    "--brand-color-light": `color-mix(in srgb, ${brandColour} 8%, transparent)`,
    "--brand-color-medium": `color-mix(in srgb, ${brandColour} 15%, transparent)`,
  }

  return (
    <div className={cn("w-full", className)}>
      <section className="relative w-full overflow-hidden rounded-2xl border border-border/50" style={brandStyle}>
        <div className="absolute inset-0 z-0 bg-background" aria-hidden />
        <CornerDotCluster />
        <WaveRibbon brandColour={brandColour} />
        <AccentBar brandColour={brandColour} className="absolute bottom-0 left-0 right-0 z-[1]" />

        {children}
      </section>
    </div>
  )
}
