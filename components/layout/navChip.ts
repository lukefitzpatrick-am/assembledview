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
