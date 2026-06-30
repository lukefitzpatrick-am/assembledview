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
  "--brand-glass-3"?: string
  "--brand-glass-8"?: string
  "--brand-glass-12"?: string
  "--brand-glass-18"?: string
  "--brand-glass-30"?: string
  "--hero-glass-strong"?: string
  "--hero-glass-mid"?: string
  "--hero-glass-soft"?: string
}

export function MediaPlanEditorHero({
  title,
  detail,
  actions,
  brandColour = "hsl(var(--secondary))",
  className,
  Icon: IconProp,
  compact = false,
}: MediaPlanEditorHeroProps) {
  const IconGlyph = IconProp ?? ClipboardList
  const brandStyle: BrandStyle = {
    "--brand-color": brandColour,
    "--brand-glass-3": "color-mix(in hsl, var(--brand-color) 3%, transparent)",
    "--brand-glass-8": "color-mix(in hsl, var(--brand-color) 8%, transparent)",
    "--brand-glass-12": "color-mix(in hsl, var(--brand-color) 12%, transparent)",
    "--brand-glass-18": "color-mix(in hsl, var(--brand-color) 18%, transparent)",
    "--brand-glass-30": "color-mix(in hsl, var(--brand-color) 30%, transparent)",
    "--hero-glass-strong": "hsl(var(--card) / 0.98)",
    "--hero-glass-mid": "hsl(var(--surface-panel) / 0.95)",
    "--hero-glass-soft": "hsl(var(--surface-panel) / 0.7)",
  }

  return (
    <div className={cn("w-full", className)}>
      <section className="relative w-full overflow-hidden rounded-2xl border border-border/50" style={brandStyle}>
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(135deg, 
              var(--hero-glass-strong) 0%, 
              var(--hero-glass-mid) 15%,
              var(--brand-glass-3) 30%,
              var(--brand-glass-8) 50%,
              var(--brand-glass-12) 70%,
              var(--brand-glass-18) 100%
            )`,
          }}
          aria-hidden
        />

        <div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(
              ellipse 80% 100% at 0% 50%,
              var(--hero-glass-mid) 0%,
              var(--hero-glass-soft) 25%,
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
              var(--brand-color) 0px,
              var(--brand-color) 1px,
              transparent 1px,
              transparent 12px
            )`,
          }}
          aria-hidden
        />

        <div
          className="absolute -right-20 -top-20 h-80 w-80 rounded-full opacity-20 blur-3xl"
          style={{ backgroundColor: "var(--brand-color)" }}
          aria-hidden
        />

        <div
          className="absolute bottom-0 left-0 right-0 h-1"
          style={{
            background: `linear-gradient(90deg, 
              transparent 0%, 
              var(--brand-glass-30) 20%,
              var(--brand-color) 50%,
              var(--brand-glass-30) 80%,
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
                  style={{ backgroundColor: "var(--brand-color)" }}
                  aria-hidden
                />
                <div
                  className={cn(
                    "relative flex shrink-0 items-center justify-center rounded-full border-2 shadow-lg",
                    compact ? "h-14 w-14" : "h-16 w-16"
                  )}
                  style={{
                    borderColor: "var(--brand-glass-30)",
                    backgroundColor: "var(--brand-glass-12)",
                  }}
                  aria-hidden
                >
                  <IconGlyph
                    className={compact ? "h-6 w-6" : "h-7 w-7"}
                    style={{ color: "var(--brand-color)" }}
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
