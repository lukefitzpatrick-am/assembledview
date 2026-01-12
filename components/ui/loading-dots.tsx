"use client"

import { cn } from "@/lib/utils"

type LoadingDotsSize = "sm" | "md" | "lg"

interface LoadingDotsProps {
  size?: LoadingDotsSize
  className?: string
  dotClassName?: string
  "aria-label"?: string
}

const dotSizeMap: Record<LoadingDotsSize, string> = {
  sm: "h-2 w-2",
  md: "h-3 w-3",
  lg: "h-4 w-4",
}

export function LoadingDots({
  size = "md",
  className,
  dotClassName,
  "aria-label": ariaLabel = "Loading",
}: LoadingDotsProps) {
  return (
    <div
      className={cn("flex items-center gap-1.5", className)}
      role="status"
      aria-label={ariaLabel}
    >
      {[0, 1, 2].map((idx) => (
        <span
          key={idx}
          className={cn(
            "loading-dots__dot rounded-full bg-primary",
            dotSizeMap[size],
            dotClassName
          )}
          style={{ animationDelay: `${idx * 0.16}s` }}
        />
      ))}
    </div>
  )
}
