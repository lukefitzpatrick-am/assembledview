export const CHART_ANIMATION = {
  duration: 750,
  easing: "ease-out" as const,
  delay: 100,
  staggerDelay: 80,
} as const

/** Pacing line charts: neutral expected/budget vs coloured actuals. */
export const PACING_CHART_STROKE = {
  expected: "hsl(var(--muted-foreground))",
  grid: "hsl(var(--muted-foreground))",
} as const

export const TOOLTIP_CONFIG = {
  cursor: { fill: "rgba(0,0,0,0.04)" },
  wrapperStyle: { outline: "none", zIndex: 50 },
  showPercentages: true,
} as const

export const AXIS_CONFIG = {
  tickStyle: { fill: "hsl(var(--muted-foreground))", fontSize: 11 },
  gridStyle: { strokeDasharray: "4 4", strokeOpacity: 0.08, stroke: "hsl(var(--muted-foreground))" },
  rotateThreshold: 10,
  rotateAngle: -45,
  rotateHeight: 56,
} as const

export const RESPONSIVE_CHART = {
  heights: {
    sm: 280,
    md: 320,
    lg: 380,
  },
  legend: {
    desktop: "right" as const,
    mobile: "bottom" as const,
  },
  labelDensity: {
    denseThreshold: 16,
    sparseThreshold: 8,
  },
} as const
