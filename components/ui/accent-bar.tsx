import * as React from "react"

import { cn } from "@/lib/utils"

export interface AccentBarProps extends React.HTMLAttributes<HTMLDivElement> {
  brandColour?: string
}

/**
 * Multi-segment brand strip used at the bottom of dashboard hero shells.
 * Uses Assembled brand tokens while allowing callers to inject a brand/client colour.
 */
export function AccentBar({ brandColour = "hsl(var(--primary))", className, style, ...props }: AccentBarProps) {
  const background = `linear-gradient(90deg,
    hsl(var(--accent)) 0%, hsl(var(--accent)) 20%,
    var(--channel-social) 20%, var(--channel-social) 40%,
    ${brandColour} 40%, ${brandColour} 60%,
    hsl(var(--secondary)) 60%, hsl(var(--secondary)) 80%,
    var(--channel-bvod) 80%, var(--channel-bvod) 100%
  )`

  return (
    <div
      aria-hidden="true"
      className={cn("h-[3px] w-full", className)}
      style={{ background, ...style }}
      {...props}
    />
  )
}
