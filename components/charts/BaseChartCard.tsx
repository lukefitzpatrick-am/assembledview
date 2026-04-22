"use client"

import type { LucideIcon } from "lucide-react"
import { BarChart3 } from "lucide-react"
import type { ReactNode } from "react"

import { useClientBrandOptional } from "@/components/client-dashboard/ClientBrandProvider"
import { cn } from "@/lib/utils"

export type BaseChartCardVariant = "icon" | "accent" | "minimal"

export type BaseChartCardProps = {
  title: string
  description?: string
  variant?: BaseChartCardVariant
  icon?: LucideIcon
  accentColor?: string
  toolbar?: ReactNode
  footer?: ReactNode
  isEmpty?: boolean
  emptyMessage?: string
  minHeight?: number
  className?: string
  contentClassName?: string
  children: ReactNode
}

export default function BaseChartCard({
  title,
  description,
  variant = "icon",
  icon: Icon = BarChart3,
  accentColor: accentColorProp,
  toolbar,
  footer,
  isEmpty = false,
  emptyMessage = "No data available",
  minHeight = 300,
  className,
  contentClassName,
  children,
}: BaseChartCardProps) {
  const brand = useClientBrandOptional()
  const accentColor = accentColorProp ?? brand?.primary ?? "hsl(var(--primary))"

  return (
    <div className={cn("rounded-2xl border border-border/60 bg-card p-5", className)}>
      <div className="mb-4 flex items-start gap-3">
        {variant === "icon" ? (
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted/50 text-muted-foreground">
            <Icon className="h-4 w-4" aria-hidden />
          </span>
        ) : variant === "accent" ? (
          <div
            className="mt-0.5 w-1 shrink-0 self-stretch rounded-full"
            style={{ backgroundColor: accentColor }}
            aria-hidden
          />
        ) : null}

        <div className="min-w-0 flex-1 space-y-0.5">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
        </div>

        {toolbar ? <div className="ml-auto flex shrink-0 items-center gap-2">{toolbar}</div> : null}
      </div>

      {isEmpty ? (
        <div
          className="flex items-center justify-center px-4 py-8 text-sm text-muted-foreground"
          style={{ minHeight }}
        >
          {emptyMessage}
        </div>
      ) : (
        <div className={cn(contentClassName)}>{children}</div>
      )}

      {footer ? <div className="mt-4">{footer}</div> : null}
    </div>
  )
}
