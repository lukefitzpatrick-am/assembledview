"use client"

import { ClipboardList, type LucideIcon } from "lucide-react"
import type { CSSProperties, ReactNode } from "react"

import { cn } from "@/lib/utils"

export interface MediaPlanEditorHeroProps {
  title: string
  /** Primary helper text and any extra lines (e.g. MBA reference) */
  detail?: ReactNode
  /** Right-aligned controls (e.g. Copy Context) */
  actions?: ReactNode
  /** Brand tint for gradients; defaults to dashboard hero default */
  brandColour?: string
  className?: string
  /** Optional leading icon; defaults to ClipboardList */
  Icon?: LucideIcon
  /** Tighter padding and gaps (e.g. dashboard overview). */
  compact?: boolean
}

type BrandStyle = CSSProperties & {
  "--brand-color"?: string
}

function hexToRgba(hex: string, alpha: number): string {
  const trimmed = hex.replace("#", "")
  const expanded = trimmed.length === 3 ? trimmed.split("").map((c) => c + c).join("") : trimmed
  const r = parseInt(expanded.slice(0, 2), 16)
  const g = parseInt(expanded.slice(2, 4), 16)
  const b = parseInt(expanded.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export function MediaPlanEditorHero({
  title,
  detail,
  actions,
  brandColour = "#4f8fcb",
  className,
  Icon: IconProp,
  compact = false,
}: MediaPlanEditorHeroProps) {
  const IconGlyph = IconProp ?? ClipboardList
  const brandStyle: BrandStyle = {
    "--brand-color": brandColour,
  }

  return (
    <div className={cn("w-full", className)}>
      <section className="relative w-full overflow-hidden rounded-2xl border border-border/50" style={brandStyle}>
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(135deg, 
              rgba(255,255,255,0.98) 0%, 
              rgba(255,255,255,0.95) 15%,
              ${hexToRgba(brandColour, 0.03)} 30%,
              ${hexToRgba(brandColour, 0.08)} 50%,
              ${hexToRgba(brandColour, 0.12)} 70%,
              ${hexToRgba(brandColour, 0.18)} 100%
            )`,
          }}
          aria-hidden
        />

        <div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(
              ellipse 80% 100% at 0% 50%,
              rgba(255,255,255,0.95) 0%,
              rgba(255,255,255,0.7) 25%,
              transparent 60%
            )`,
          }}
          aria-hidden
        />

        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `repeating-linear-gradient(
              -45deg,
              ${brandColour} 0px,
              ${brandColour} 1px,
              transparent 1px,
              transparent 12px
            )`,
          }}
          aria-hidden
        />

        <div
          className="absolute -right-20 -top-20 h-80 w-80 rounded-full opacity-20 blur-3xl"
          style={{ backgroundColor: brandColour }}
          aria-hidden
        />

        <div
          className="absolute bottom-0 left-0 right-0 h-1"
          style={{
            background: `linear-gradient(90deg, 
              transparent 0%, 
              ${hexToRgba(brandColour, 0.3)} 20%,
              ${brandColour} 50%,
              ${hexToRgba(brandColour, 0.3)} 80%,
              transparent 100%
            )`,
          }}
          aria-hidden
        />

        <div className="absolute inset-0 bg-background/50 dark:bg-background/80" aria-hidden />

        <div
          className={cn(
            "relative z-10",
            compact ? "p-4 md:p-5 lg:p-6 xl:p-6" : "p-6 md:p-8 lg:p-8 xl:p-10"
          )}
        >
          <div
            className={cn(
              "flex w-full flex-col md:flex-row md:items-start md:justify-between",
              compact ? "gap-4 md:gap-6 xl:gap-8" : "gap-6 md:gap-8 xl:gap-10"
            )}
          >
            <div
              className={cn(
                "flex min-w-0 flex-1 flex-col sm:flex-row sm:items-start",
                compact ? "gap-3 sm:gap-5 md:gap-6" : "gap-4 sm:gap-6 md:gap-8"
              )}
            >
              <div className="relative flex shrink-0 items-center gap-4">
                <div
                  className="absolute -inset-2 rounded-full opacity-20 blur-xl"
                  style={{ backgroundColor: brandColour }}
                  aria-hidden
                />
                <div
                  className={cn(
                    "relative flex shrink-0 items-center justify-center rounded-full border-2 shadow-lg",
                    compact ? "h-14 w-14" : "h-16 w-16"
                  )}
                  style={{
                    borderColor: hexToRgba(brandColour, 0.3),
                    backgroundColor: hexToRgba(brandColour, 0.12),
                  }}
                  aria-hidden
                >
                  <IconGlyph
                    className={compact ? "h-6 w-6" : "h-7 w-7"}
                    style={{ color: brandColour }}
                    strokeWidth={1.75}
                  />
                </div>
              </div>

              <div className="min-w-0 flex-1 space-y-2">
                <h1
                  className={cn(
                    "font-semibold tracking-tight text-foreground",
                    compact ? "text-xl md:text-2xl xl:text-3xl" : "text-2xl md:text-3xl xl:text-4xl"
                  )}
                >
                  {title}
                </h1>
                {detail != null ? (
                  <div className="space-y-1 text-sm text-muted-foreground md:text-base [&_p]:leading-relaxed">
                    {detail}
                  </div>
                ) : null}
              </div>
            </div>

            {actions ? (
              <div className={cn("flex shrink-0 flex-wrap items-center gap-2 sm:justify-end", !compact && "md:pt-1")}>
                {actions}
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  )
}
