"use client"

import {
  type CSSProperties,
  type MutableRefObject,
  type ReactNode,
  type RefObject,
  useCallback,
  useRef,
  useState,
} from "react"
import { Download } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ChartExportToolbar } from "@/components/charts/ChartExportToolbar"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { CHART_ANIMATION } from "@/lib/charts/dashboardTheme"
import { cn } from "@/lib/utils"

const formatTimestamp = (value: string | Date): string => {
  if (value instanceof Date) {
    return value.toLocaleString("en-AU")
  }
  return value
}

export type ChartShellProps = {
  title: string
  description?: string
  children: ReactNode
  onExportCsv?: () => void
  onExportPng?: () => void
  showExport?: boolean
  lastUpdated?: string | Date
  helperText?: string
  className?: string
  chartAreaClassName?: string
  /** Merged onto the chart-area wrapper (e.g. dynamic height from ResizeObserver). */
  chartAreaStyle?: CSSProperties
  chartAreaRef?: RefObject<HTMLDivElement | null>
}

function ChartShellRoot({
  title,
  description,
  children,
  onExportCsv,
  onExportPng,
  showExport = true,
  lastUpdated,
  helperText,
  className,
  chartAreaClassName = "h-80",
  chartAreaStyle,
  chartAreaRef,
}: ChartShellProps) {
  const [isExporting, setIsExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const fallbackAreaRef = useRef<HTMLDivElement | null>(null)
  const pngTargetRef = chartAreaRef ?? fallbackAreaRef

  const assignAreaRef = useCallback(
    (node: HTMLDivElement | null) => {
      fallbackAreaRef.current = node
      if (chartAreaRef) {
        ;(chartAreaRef as MutableRefObject<HTMLDivElement | null>).current = node
      }
    },
    [chartAreaRef]
  )

  return (
    <Card
      className={cn("overflow-hidden rounded-2xl border-muted/70 shadow-sm", className)}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <CardTitle className="truncate text-lg">{title}</CardTitle>
            {description ? (
              <CardDescription className="mt-1">{description}</CardDescription>
            ) : null}
          </div>

          {showExport ? (
            <ChartExportToolbar
              title={title}
              chartAreaRef={pngTargetRef}
              onExportCsv={onExportCsv}
              onExportPng={onExportPng}
              onIsExportingChange={setIsExporting}
              onExportErrorChange={setExportError}
            />
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="p-5 pt-0">
        <div
          ref={assignAreaRef}
          className={cn("relative min-w-0", chartAreaClassName)}
          style={chartAreaStyle}
        >
          {children}
          {isExporting ? (
            <div
              className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-background/65 backdrop-blur-[1px]"
              style={{ transitionDuration: `${CHART_ANIMATION.duration}ms` }}
            >
              <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-sm">
                <Download className="h-3.5 w-3.5" />
                Generating PNG...
              </div>
            </div>
          ) : null}
        </div>
        {helperText ? (
          <p className="mt-3 text-xs text-muted-foreground">{helperText}</p>
        ) : null}
      </CardContent>

      {lastUpdated || exportError ? (
        <CardFooter className="flex items-center justify-between border-t border-border/70 px-5 py-2.5 text-xs text-muted-foreground">
          <span>
            {lastUpdated ? `Last updated: ${formatTimestamp(lastUpdated)}` : ""}
          </span>
          <span className="text-error">{exportError ?? ""}</span>
        </CardFooter>
      ) : null}
    </Card>
  )
}

export type ChartShellLegendItem = {
  key: string
  label: string
  color: string
}

export type ChartShellLegendProps = {
  items: ChartShellLegendItem[]
  hiddenKeys: Set<string>
  onToggle: (key: string) => void
  maxVisible?: number
  className?: string
}

function ChartShellLegend({
  items,
  hiddenKeys,
  onToggle,
  maxVisible,
  className,
}: ChartShellLegendProps) {
  const [expanded, setExpanded] = useState(false)
  const cap = maxVisible
  const hasCap = typeof cap === "number" && cap > 0
  const overflowCount =
    hasCap && !expanded ? Math.max(0, items.length - cap) : 0
  const visibleSlice = hasCap && !expanded ? items.slice(0, cap) : items

  return (
    <div
      className={cn(
        "mt-3 flex flex-wrap items-center gap-x-3 gap-y-2",
        className
      )}
      role="toolbar"
      aria-label="Chart legend"
    >
      {visibleSlice.map((item) => {
        const hidden = hiddenKeys.has(item.key)
        return (
          <button
            key={item.key}
            type="button"
            aria-pressed={hidden}
            className={cn(
              "inline-flex max-w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-xs transition-colors",
              hidden
                ? "text-muted-foreground hover:text-foreground"
                : "text-foreground hover:bg-muted/70"
            )}
            onClick={() => onToggle(item.key)}
          >
            <span
              className={cn(
                "h-2.5 w-2.5 shrink-0 rounded-full",
                hidden && "opacity-35"
              )}
              style={{ backgroundColor: item.color }}
              aria-hidden="true"
            />
            <span className="truncate">{item.label}</span>
          </button>
        )
      })}
      {overflowCount > 0 ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 gap-1 px-2 text-xs"
          onClick={() => setExpanded(true)}
        >
          +{overflowCount} more
        </Button>
      ) : null}
      {hasCap && expanded && cap !== undefined && items.length > cap ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-muted-foreground"
          onClick={() => setExpanded(false)}
        >
          Show less
        </Button>
      ) : null}
    </div>
  )
}

export const ChartShell: typeof ChartShellRoot & {
  Legend: typeof ChartShellLegend
} = Object.assign(ChartShellRoot, { Legend: ChartShellLegend })
