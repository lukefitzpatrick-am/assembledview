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

