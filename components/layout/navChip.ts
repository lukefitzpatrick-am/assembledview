import { cn } from "@/lib/utils"

const NAV_CHIP_BASE =
  "inline-flex items-center rounded-full px-4 py-1.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

export function navChipClass(active: boolean): string {
  return cn(
    NAV_CHIP_BASE,
    active
      ? "bg-foreground text-background"
      : "border border-border bg-card text-muted-foreground hover:text-foreground",
  )
}

const SEGMENT_CHIP_BASE =
  "rounded-pill px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

/** Plan-editor segment. Active is the default Button: lime fill, ink text. */
export function segmentChipClass(active: boolean): string {
  return cn(
    SEGMENT_CHIP_BASE,
    active
      ? "bg-accent text-accent-foreground"
      : "bg-transparent text-muted-foreground hover:text-foreground",
  )
}
