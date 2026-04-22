"use client"

import { useClientBrand } from "@/components/client-dashboard/ClientBrandProvider"
import { cn } from "@/lib/utils"

export type ChipVariant = "default" | "success" | "warning" | "danger"

export type ChipProps = {
  children: string
  variant?: ChipVariant
  className?: string
}

export function Chip({ children, variant = "default", className }: ChipProps) {
  const theme = useClientBrand()

  const variantClass =
    variant === "success"
      ? "bg-status-success/15 text-status-success"
      : variant === "warning"
        ? "bg-status-warning/15 text-status-warning"
        : variant === "danger"
          ? "bg-status-danger/15 text-status-danger"
          : null

  const inlineStyle =
    variant === "default"
      ? { backgroundColor: theme.primaryTint, color: theme.primaryDark }
      : undefined

  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center truncate rounded-full px-2.5 py-0.5 text-xs font-medium leading-none",
        variantClass,
        className,
      )}
      style={inlineStyle}
    >
      {children}
    </span>
  )
}
