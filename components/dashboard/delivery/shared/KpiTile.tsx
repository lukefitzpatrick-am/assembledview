import { cn } from "@/lib/utils"
import { StatusPill } from "./StatusPill"
import { statusBg, type DeliveryStatus } from "./statusColours"

export interface KpiTileProps {
  label: string
  /** Big number, formatted (e.g. "$15.34", "2.35%"). */
  value: string
  /** Expected target, formatted. Optional - when absent, no comparison shown. */
  expected?: string
  /** Status when comparison applies. Defaults to "no-data" when expected is absent. */
  status?: DeliveryStatus
  /** Progress 0..1, optional progress bar under the value. */
  progress?: number
  /** Optional accent dot at top-left, used for media-type colour. */
  accentColour?: string
  className?: string
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0
  return Math.max(0, Math.min(1, n))
}

export function KpiTile({
  label,
  value,
  expected,
  status,
  progress,
  accentColour,
  className,
}: KpiTileProps) {
  const effectiveStatus: DeliveryStatus = status ?? "no-data"
  return (
    <div className={cn("rounded-xl border border-border/60 bg-card p-3", className)}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {accentColour ? (
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: accentColour }}
              aria-hidden
            />
          ) : null}
          <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
        </div>
        {expected ? <StatusPill status={effectiveStatus} /> : null}
      </div>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
      {expected ? (
        <p className="text-[11px] text-muted-foreground">Expected: {expected}</p>
      ) : null}
      {typeof progress === "number" ? (
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full", statusBg[effectiveStatus])}
            style={{ width: `${clamp01(progress) * 100}%` }}
          />
        </div>
      ) : null}
    </div>
  )
}
