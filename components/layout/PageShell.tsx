import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

const WIDTHS = {
  full: "max-w-[1920px]",
  standard: "max-w-[1600px]",
  reading: "max-w-3xl",
  narrow: "max-w-xl",
} as const

export interface PageShellProps {
  width?: keyof typeof WIDTHS
  className?: string
  children: ReactNode
}

export function PageShell({ width = "standard", className, children }: PageShellProps) {
  return (
    <div
      className={cn(
        "mx-auto w-full px-4 sm:px-5 md:px-6 xl:px-8 pb-16 pt-4 space-y-6",
        WIDTHS[width],
        className,
      )}
    >
      {children}
    </div>
  )
}
