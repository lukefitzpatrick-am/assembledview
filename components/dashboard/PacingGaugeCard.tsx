import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

export const DIAL_HEIGHT = 100
const ARC_STROKE_WIDTH = 50
const NEEDLE_STROKE_WIDTH = 0
const VIEWBOX_W = 750
const VIEWBOX_H = 180

type PacingGaugeCardProps = {
  pacingPct: number
  actual: number | string
  expected: number | string
  delta: number | string
  asAt: string
  title?: string
  className?: string
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

const formatPercent = (value: number) => `${Math.round(value)}%`

const getStatus = (pacing: number) => {
  if (pacing < 80) return "Behind"
  if (pacing < 100) return "At risk"
  return "On track"
}

const palette = {
  error: "#ff6003",
  warning: "#ffcf2a",
  success: "#008e5e",
}

const getBandColor = (pacing: number) => {
  if (pacing < 80) return { stroke: palette.error, fill: "rgba(255, 96, 3, 0.32)" }
  if (pacing < 100) return { stroke: palette.warning, fill: "rgba(255, 207, 42, 0.32)" }
  return { stroke: palette.success, fill: "rgba(0, 142, 94, 0.3)" }
}

const arcPath = (
  fromPct: number,
  toPct: number,
  radiusX: number,
  radiusY: number,
  centerX: number,
  centerY: number
) => {
  const startRad = (fromPct / 200) * Math.PI
  const endRad = (toPct / 200) * Math.PI
  const x1 = centerX - radiusX * Math.cos(startRad)
  const y1 = centerY - radiusY * Math.sin(startRad)
  const x2 = centerX - radiusX * Math.cos(endRad)
  const y2 = centerY - radiusY * Math.sin(endRad)
  const largeArc = endRad - startRad > Math.PI ? 1 : 0
  return `M ${x1} ${y1} A ${radiusX} ${radiusY} 0 ${largeArc} 1 ${x2} ${y2}`
}

export default function PacingGaugeCard({
  pacingPct,
  actual,
  expected,
  delta,
  asAt,
  title = "Pacing",
  className,
}: PacingGaugeCardProps) {
  const center = { x: VIEWBOX_W / 2, y: VIEWBOX_H - 10 }
  const radiusX = 360
  const radiusY = 160
  const pacingValue = typeof pacingPct === "number" ? pacingPct : Number(pacingPct) || 0
  const capped = clamp(pacingValue, 0, 200)
  const angleDeg = (capped / 200) * 180
  const needleRad = (Math.PI * angleDeg) / 180
  const bandColor = getBandColor(Math.max(pacingValue, 0))
  const end = {
    x: center.x - radiusX * Math.cos(needleRad),
    y: center.y - radiusY * Math.sin(needleRad),
  }
  const status = getStatus(Math.max(pacingValue, 0))
  const mutedStroke = "hsl(var(--foreground) / 0.65)"
  const mutedStrokeLight = "hsl(var(--foreground) / 0.35)"

  const annotations = [
    { text: "0%", x: center.x - radiusX, y: center.y + 14, align: "start" as const },
    { text: "100%", x: center.x, y: center.y - radiusY - 6, align: "middle" as const },
    { text: "200%", x: center.x + radiusX, y: center.y + 14, align: "end" as const },
  ]

  const statusClass =
    status === "On track" ? "bg-[#008e5e] text-white border-[#008e5e]" : ""

  return (
    <Card className={cn("h-full", className)}>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2 pt-4">
        <div className="space-y-1">
          <CardTitle className="text-sm font-medium leading-none line-clamp-1">{title}</CardTitle>
          <p className="text-xs text-muted-foreground leading-none line-clamp-1">100% = on target</p>
        </div>
        <Badge
          variant="outline"
          className={cn(
            "ml-2 text-[11px] font-medium px-2 py-0.5 whitespace-nowrap",
            statusClass
          )}
        >
          {status}
        </Badge>
      </CardHeader>
      <CardContent className="flex h-[calc(170px-60px)] flex-col justify-center px-0 pt-0 pb-2 overflow-visible">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={`${formatPercent(pacingPct)} pacing as at ${asAt}`}
                className="relative w-full rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
              <div className="w-full flex items-center justify-center overflow-visible">
                  <svg
                    viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
                    className="w-full"
                    style={{ maxHeight: DIAL_HEIGHT, overflow: "visible" }}
                    role="img"
                    aria-hidden="true"
                  >
                    {/* tinted bands */}
                    {[{ from: 0, to: 80 }, { from: 80, to: 100 }, { from: 100, to: 200 }].map((band) => {
                      const bandColor = getBandColor(band.from === 100 ? 120 : band.to - 1)
                      return (
                        <path
                          key={`${band.from}-${band.to}`}
                          d={arcPath(band.from, band.to, radiusX, radiusY, center.x, center.y)}
                          fill="none"
                          stroke={bandColor.fill}
                          strokeWidth={ARC_STROKE_WIDTH}
                          strokeLinecap="round"
                        />
                      )
                    })}
                    {/* band edge outlines */}
                    {[{ from: 0, to: 80 }, { from: 80, to: 100 }, { from: 100, to: 200 }].map((band) => (
                      <path
                        key={`edge-${band.from}-${band.to}`}
                        d={arcPath(band.from, band.to, radiusX, radiusY, center.x, center.y)}
                        fill="none"
                        stroke={mutedStrokeLight}
                        strokeWidth={1.5}
                        strokeLinecap="round"
                      />
                    ))}

                    {/* outer outline */}
                    <path
                      d={`M ${center.x - radiusX} ${center.y} A ${radiusX} ${radiusY} 0 0 1 ${center.x + radiusX} ${center.y}`}
                      fill="none"
                      stroke={mutedStroke}
                      strokeWidth={1.5}
                      strokeLinecap="round"
                    />

                    {/* pacing head (no line, oversized dot) */}
                    <circle cx={end.x} cy={end.y} r={16} fill={bandColor.stroke} stroke={mutedStroke} strokeWidth={2} />

                    {/* center labels */}
                    <text x={center.x} y={center.y - 6} textAnchor="middle" className="fill-foreground" fontSize="46" fontWeight="800">
                      {formatPercent(pacingPct)}
                    </text>
                    <text x={center.x} y={center.y + 18} textAnchor="middle" className="fill-muted-foreground" fontSize="12">
                      Pacing
                    </text>

                    {/* annotations */}
                    {annotations.map((ann) => (
                      <text
                        key={ann.text}
                        x={ann.x}
                        y={ann.y}
                        textAnchor={ann.align}
                        className="fill-muted-foreground"
                        fontSize="10"
                      >
                        {ann.text}
                      </text>
                    ))}
                  </svg>
                </div>
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="w-60 text-xs bg-popover border shadow-md">
              <div className="font-semibold">{title}</div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Actual to date</span>
                <span className="font-medium">{actual}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Expected to date</span>
                <span className="font-medium">{expected}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Delta</span>
                <span className="font-medium">{delta}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Pacing %</span>
                <span className="font-semibold">{formatPercent(pacingPct)}</span>
              </div>
              <div className="text-[11px] text-muted-foreground">As at {asAt || "—"}</div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </CardContent>
    </Card>
  )
}
