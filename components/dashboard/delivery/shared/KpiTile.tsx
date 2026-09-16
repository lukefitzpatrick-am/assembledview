import { cn } from "@/lib/utils"
import { StatusPill } from "./StatusPill"
import { statusBg, type DeliveryStatus } from "./statusColours"

export type KpiEmptyHint = "not-tracked" | "none-recorded"

export interface KpiTileProps {
  label: string
  /** Big number, formatted (e.g. "$15.34", "2.35%"). Null = dashed empty tile. */
  value: string | null
  /** Expected target, formatted. Optional - when absent, no comparison shown. */
  expected?: string
  /** Status when comparison applies. Defaults to "no-data" when expected is absent. */
  status?: DeliveryStatus
  /** Progress 0..1, optional progress bar under the value. */
  progress?: number
  /** Optional accent dot at top-left, used for media-type colour. */
  accentColour?: string
  /** Caption under the value (e.g. planned CPM, % of impressions). */
  caption?: string
  /** Copy when `value` is null. */
  emptyHint?: KpiEmptyHint
  className?: string
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0
  return Math.max(0, Math.min(1, n))
}

function emptyCopy(hint: KpiEmptyHint | undefined): string {
  return hint === "not-tracked" ? "Not tracked on this campaign" : "None recorded"
}

export function KpiTile({
  label,
  value,
  expected,
  status,
  progress,
  accentColour,
  caption,
  emptyHint,
  className,
}: KpiTileProps) {
  const effectiveStatus: DeliveryStatus = status ?? "no-data"
  const isEmpty = value == null
  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-3",
        isEmpty ? "border-dashed border-border" : "border-border/60",
        className,
      )}
    >
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
        {!isEmpty && expected ? <StatusPill status={effectiveStatus} /> : null}
      </div>
      {isEmpty ? (
        <p className="mt-1 text-sm text-muted-foreground">{emptyCopy(emptyHint)}</p>
      ) : (
        <p className="mt-1 text-lg font-semibold tabular-nums num">{value}</p>
      )}
      {caption ? <p className="text-[11px] text-muted-foreground">{caption}</p> : null}
      {!isEmpty && expected ? (
        <p className="text-[11px] text-muted-foreground">Expected: {expected}</p>
      ) : null}
      {!isEmpty && typeof progress === "number" ? (
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
