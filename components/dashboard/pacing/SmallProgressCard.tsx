import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { ReactNode } from "react"

type StatusState = "behind" | "onTrack" | "ahead"

type Props = {
  label: string
  value: ReactNode
  helper?: string
  pacingPct?: number
  progressRatio?: number
  className?: string
  accentColor?: string
  pillLabel?: string
  footer?: string
  hideStatus?: boolean
}

const defaultAccent = "#5b4bff"

const statusCopy: Record<StatusState, { label: string; badge: string }> = {
  behind: { label: "Behind", badge: "bg-destructive/15 text-destructive" },
  onTrack: { label: "On track", badge: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  ahead: { label: "Ahead", badge: "bg-blue-500/15 text-blue-600 dark:text-blue-400" },
}

function getStatus(pacing?: number): StatusState {
  if (typeof pacing !== "number" || Number.isNaN(pacing)) return "onTrack"
  if (pacing < 90) return "behind"
  if (pacing > 110) return "ahead"
  return "onTrack"
}

export function SmallProgressCard({
  label,
  value,
  helper,
  pacingPct,
  progressRatio,
  className,
  accentColor = defaultAccent,
  pillLabel,
  footer,
  hideStatus = false,
}: Props) {
  const progressValue = Math.round((progressRatio ?? 0) * 100)
  const status = getStatus(pacingPct)

  return (
    <Card className={cn("rounded-2xl border-muted/70 shadow-sm", className)}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="text-xs font-medium text-muted-foreground">{label}</div>
            <div className="text-3xl font-semibold leading-tight">{value}</div>
            {helper ? <div className="text-xs text-muted-foreground">{helper}</div> : null}
          </div>
          <div className="flex flex-col items-end gap-2">
            <Badge variant="secondary" className="rounded-full px-3 py-1 text-[11px] font-semibold">
              {typeof pacingPct === "number" ? `${pacingPct.toFixed(2)}%` : "—"}
            </Badge>
            {!hideStatus ? (
              <Badge className={cn("rounded-full px-3 py-1 text-[11px] font-medium", statusCopy[status].badge)}>
                {statusCopy[status].label}
              </Badge>
            ) : null}
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <div className="flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-3 rounded-full transition-all"
              style={{
                width: `${Math.max(0, Math.min(progressValue, 100))}%`,
                background: `linear-gradient(90deg, ${accentColor}, ${accentColor}cc)`,
              }}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.max(0, Math.min(progressValue, 100))}
            />
          </div>
        </div>

        {footer ? <div className="mt-3 text-xs text-muted-foreground">{footer}</div> : null}
      </CardContent>
    </Card>
  )
}

export function clampProgress(value: number) {
  return Math.max(0, Math.min(value, 1))
}
