import { cn } from "@/lib/utils"

type BilledStatusPillProps = {
  billed: boolean | undefined
  className?: string
}

export function BilledStatusPill({ billed, className }: BilledStatusPillProps) {
  const isBilled = billed === true
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        isBilled
          ? "bg-[hsl(var(--status-success))] text-[hsl(var(--status-success-foreground))]"
          : "bg-[hsl(var(--status-warning)/0.15)] text-amber-800 dark:text-amber-300",
        className
      )}
    >
      {isBilled ? "Billed" : "Unbilled"}
    </span>
  )
}
