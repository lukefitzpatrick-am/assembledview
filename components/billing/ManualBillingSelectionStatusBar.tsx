"use client"

type ManualBillingSelectionStatusBarProps = Readonly<{
  count: number
  sum: number
  formatter: Intl.NumberFormat
}>

export function ManualBillingSelectionStatusBar({
  count,
  sum,
  formatter,
}: ManualBillingSelectionStatusBarProps) {
  if (count < 2) return null

  return (
    <div
      className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t bg-muted/40 px-6 py-2 text-sm text-muted-foreground"
      role="status"
      aria-live="polite"
    >
      <span>
        <span className="font-medium text-foreground">{count}</span> cells selected
      </span>
      <span>
        Sum:{" "}
        <span className="font-medium tabular-nums text-foreground">
          {formatter.format(sum)}
        </span>
      </span>
    </div>
  )
}
