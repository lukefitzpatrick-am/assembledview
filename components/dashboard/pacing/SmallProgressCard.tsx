import { Download } from "lucide-react"
import { Sparkline } from "@/components/charts/Sparkline"
import { PacingStatusBadge } from "@/components/dashboard/PacingStatusBadge"
import { Button } from "@/components/ui/button"
import { CHART_PROGRESS_CARD_DEFAULT_ACCENT } from "@/lib/charts/theme"
import { cn } from "@/lib/utils"
import { useEffect, useRef, useState, type ReactNode } from "react"

type StatusState = "ahead" | "on-track" | "behind" | "critical"

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
  status?: StatusState
  sparklineData?: number[]
  comparisonValue?: number
  comparisonLabel?: string
  onExport?: () => void
  showExportButton?: boolean
  /** Use flat panel shell (no Card) when nested inside a Panel. */
  embedded?: boolean
  size?: "sm" | "md" | "lg"
  onClick?: () => void
}

const defaultAccent = CHART_PROGRESS_CARD_DEFAULT_ACCENT

const GREEN_500 = "rgb(34 197 94)"
const AMBER_500 = "rgb(245 158 11)"
const RED_500 = "rgb(239 68 68)"

const statusStyleMap: Record<
  StatusState,
  {
    textClass: string
    progress: string
  }
> = {
  ahead: {
    textClass: "text-green-600",
    progress: GREEN_500,
  },
  "on-track": {
    textClass: "text-green-600",
    progress: GREEN_500,
  },
  behind: {
    textClass: "text-amber-600",
    progress: AMBER_500,
  },
  critical: {
    textClass: "text-red-600",
    progress: RED_500,
  },
}

function getAutoStatus(pacing?: number): StatusState {
  if (typeof pacing !== "number" || Number.isNaN(pacing)) return "on-track"
  const d = Math.abs(pacing - 100)
  if (d <= 10) return "on-track"
  if (d <= 20) return "behind"
  return "critical"
}

const sizeClassMap: Record<NonNullable<Props["size"]>, { value: string; padding: string }> = {
  sm: { value: "text-xl", padding: "p-3" },
  md: { value: "text-2xl", padding: "p-4" },
  lg: { value: "text-3xl", padding: "p-5" },
}

function normalizePacingPercent(value?: number): number | null {
  if (typeof value !== "number" || Number.isNaN(value)) return null
  return value
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
  status,
  sparklineData,
  comparisonValue,
  comparisonLabel = "Target",
  onExport,
  showExportButton = false,
  embedded = false,
  size = "md",
  onClick,
}: Props) {
  const progressValue = Math.round((progressRatio ?? 0) * 100)
  const resolvedStatus = status ?? getAutoStatus(pacingPct)
  const statusStyles = statusStyleMap[resolvedStatus]
  const boundedProgress = Math.max(0, Math.min(progressValue, 100))
  const progressColor = accentColor !== defaultAccent ? accentColor : statusStyles.progress
  const resolvedPacingPct = normalizePacingPercent(pacingPct)
  const sizeClasses = embedded ? { value: "text-lg font-bold", padding: "p-0" } : sizeClassMap[size]
  const [animatedProgress, setAnimatedProgress] = useState(0)
  const [animatedPacing, setAnimatedPacing] = useState(0)
  const [reducedMotion, setReducedMotion] = useState(false)
  const mountedRef = useRef(false)
  const animatedProgressRef = useRef(0)
  const animatedPacingRef = useRef(0)

  const hasComparison =
    typeof pacingPct === "number" &&
    Number.isFinite(pacingPct) &&
    typeof comparisonValue === "number" &&
    Number.isFinite(comparisonValue)
  const comparisonDelta = hasComparison ? pacingPct - comparisonValue : null

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)")
    const update = () => setReducedMotion(media.matches)
    update()
    media.addEventListener("change", update)
    return () => media.removeEventListener("change", update)
  }, [])

  useEffect(() => {
    if (reducedMotion) {
      setAnimatedProgress(boundedProgress)
      setAnimatedPacing(resolvedPacingPct ?? 0)
      return
    }

    const duration = 800
    const delay = mountedRef.current ? 120 : 240
    mountedRef.current = true
    const start = performance.now() + delay
    const fromProgress = animatedProgressRef.current
    const toProgress = boundedProgress
    const fromPacing = animatedPacingRef.current
    const toPacing = resolvedPacingPct ?? 0
    let raf = 0

    const tick = (now: number) => {
      if (now < start) {
        raf = requestAnimationFrame(tick)
        return
      }
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      const nextProgress = fromProgress + (toProgress - fromProgress) * eased
      const nextPacing = fromPacing + (toPacing - fromPacing) * eased
      animatedProgressRef.current = nextProgress
      animatedPacingRef.current = nextPacing
      setAnimatedProgress(nextProgress)
      setAnimatedPacing(nextPacing)
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [boundedProgress, reducedMotion, resolvedPacingPct])

  const interactive = Boolean(onClick)

  return (
    <article
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        interactive
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault()
                onClick?.()
              }
            }
          : undefined
      }
      className={cn(
        "space-y-3 rounded-xl border border-border bg-card",
        sizeClasses.padding,
        embedded && "border-0 bg-transparent p-0",
        interactive &&
          "cursor-pointer transition-transform duration-150 hover:-translate-y-0.5 hover:shadow-sm active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            {!hideStatus && resolvedPacingPct !== null ? (
              <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-foreground">
                <PacingStatusBadge pacingPct={resolvedPacingPct} size="sm" showIcon={false} showLabel className="bg-transparent px-0 py-0 text-[10px]" />
              </span>
            ) : null}
          </div>
          <p className={cn("truncate font-bold leading-tight text-foreground", sizeClasses.value)}>{value}</p>
          {helper ? <p className="text-xs text-muted-foreground">{helper}</p> : null}
          {pillLabel ? (
            <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {pillLabel}
            </span>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span className="text-sm font-semibold text-foreground">
            {typeof pacingPct === "number" ? `${animatedPacing.toFixed(1)}%` : "—"}
          </span>
          {!hideStatus && !resolvedPacingPct ? (
            <PacingStatusBadge
              pacingPct={0}
              size="sm"
              showIcon
              showLabel
              className={resolvedStatus === "critical" ? "animate-pulse [animation-duration:2.2s]" : undefined}
            />
          ) : null}
          {showExportButton ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onExport}
              disabled={!onExport}
              className="h-7 rounded-full px-2.5 text-[11px]"
            >
              <Download className="mr-1 h-3.5 w-3.5" />
              Export
            </Button>
          ) : null}
        </div>
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full transition-[width] duration-500 ease-out"
          style={{
            width: `${animatedProgress}%`,
            backgroundColor: progressColor,
          }}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={boundedProgress}
        />
      </div>

      {Array.isArray(sparklineData) && sparklineData.length > 0 ? (
        <div className={statusStyles.textClass}>
          <Sparkline data={sparklineData} height={24} strokeWidth={1.8} />
        </div>
      ) : null}

      {hasComparison && comparisonDelta !== null ? (
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">vs {comparisonValue?.toFixed(0)}% {comparisonLabel?.toLowerCase() || "expected"}</span>
          <span
            className={cn(
              "font-medium",
              comparisonDelta > 0 && "text-status-success",
              comparisonDelta < 0 && "text-error",
              comparisonDelta === 0 && "text-muted-foreground"
            )}
          >
            {comparisonDelta > 0 ? "▲ +" : comparisonDelta < 0 ? "▼ " : "• "}
            {comparisonDelta.toFixed(2)}%
          </span>
        </div>
      ) : null}

      {footer ? <p className="text-xs text-muted-foreground">{footer}</p> : null}
    </article>
  )
}

export function clampProgress(value: number) {
  return Math.max(0, Math.min(value, 1))
}
