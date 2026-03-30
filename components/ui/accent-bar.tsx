import * as React from "react"

import { cn } from "@/lib/utils"

export interface AccentBarProps extends React.HTMLAttributes<HTMLDivElement> {
  brandColour?: string
}

/**
 * Multi-segment brand strip used at the bottom of dashboard hero shells.
 * Matches the gradient previously inlined in `PageHeroShell`.
 */
export function AccentBar({ brandColour = "#4f8fcb", className, style, ...props }: AccentBarProps) {
  const background = `linear-gradient(90deg,
    #C5D82D 0%, #C5D82D 20%,
    #00CED1 20%, #00CED1 40%,
    ${brandColour} 40%, ${brandColour} 60%,
    #FF69B4 60%, #FF69B4 80%,
    #FF6600 80%, #FF6600 100%
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
