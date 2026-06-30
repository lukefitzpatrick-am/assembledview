import * as React from "react"

import { cn } from "@/lib/utils"

const BRAND_DOT_COLOURS = {
  lime: "hsl(var(--accent))",
  teal: "var(--channel-social)",
  green: "hsl(var(--primary))",
  blue: "hsl(var(--secondary))",
  purple: "var(--channel-bvod)",
} as const

/** Positions from the right edge; vertical field for hero height (same pulse as `CornerDotCluster`). */
const DOTS: Array<{
  right: number
  top: number
  size: number
  color: string
  opacityMin: number
  delaySec: number
}> = [
  { right: 14, top: 18, size: 26, color: BRAND_DOT_COLOURS.lime, opacityMin: 0.48, delaySec: 0 },
  { right: 52, top: 10, size: 18, color: BRAND_DOT_COLOURS.purple, opacityMin: 0.42, delaySec: 0.22 },
  { right: 6, top: 52, size: 22, color: BRAND_DOT_COLOURS.teal, opacityMin: 0.44, delaySec: 0.44 },
  { right: 40, top: 42, size: 15, color: BRAND_DOT_COLOURS.green, opacityMin: 0.52, delaySec: 0.66 },
  { right: 70, top: 28, size: 9, color: BRAND_DOT_COLOURS.blue, opacityMin: 0.5, delaySec: 0.88 },
  { right: 58, top: 62, size: 6, color: BRAND_DOT_COLOURS.purple, opacityMin: 0.58, delaySec: 1.1 },
  { right: 28, top: 72, size: 12, color: BRAND_DOT_COLOURS.teal, opacityMin: 0.4, delaySec: 1.32 },
  { right: 84, top: 14, size: 5, color: BRAND_DOT_COLOURS.green, opacityMin: 0.48, delaySec: 1.54 },
  { right: 22, top: 108, size: 20, color: BRAND_DOT_COLOURS.purple, opacityMin: 0.46, delaySec: 0.3 },
  { right: 48, top: 96, size: 8, color: BRAND_DOT_COLOURS.teal, opacityMin: 0.52, delaySec: 0.75 },
  { right: 10, top: 128, size: 11, color: BRAND_DOT_COLOURS.green, opacityMin: 0.44, delaySec: 1.05 },
  { right: 66, top: 118, size: 14, color: BRAND_DOT_COLOURS.blue, opacityMin: 0.5, delaySec: 1.28 },
]

const KEYFRAMES_ID = "animated-dot-field-pulse-kf"

export type AnimatedDotFieldProps = React.HTMLAttributes<HTMLDivElement>

/**
 * Decorative Assembled-style dot field for the right side of a relatively positioned parent.
 * Same pulse timing as `CornerDotCluster` (4.5s ease-in-out infinite).
 */
export function AnimatedDotField({ className, ...props }: AnimatedDotFieldProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-y-0 right-0 z-0 w-[min(38%,200px)] min-h-[160px]",
        className,
      )}
      {...props}
    >
      <style
        dangerouslySetInnerHTML={{
          __html: `
@keyframes ${KEYFRAMES_ID} {
  0%, 100% {
    transform: scale(1);
    opacity: var(--adf-o-min);
  }
  50% {
    transform: scale(1.12);
    opacity: var(--adf-o-max);
  }
}
`,
        }}
      />
      {DOTS.map((d, i) => {
        const opacityMax = Math.min(1, d.opacityMin + 0.15)
        return (
          <span
            key={i}
            className="absolute rounded-full"
            style={
              {
                right: d.right,
                top: d.top,
                width: d.size,
                height: d.size,
                marginRight: -d.size / 2,
                marginTop: -d.size / 2,
                backgroundColor: d.color,
                willChange: "transform, opacity",
                transformOrigin: "center",
                ["--adf-o-min" as string]: d.opacityMin,
                ["--adf-o-max" as string]: opacityMax,
                animation: `${KEYFRAMES_ID} 4.5s ease-in-out infinite`,
                animationDelay: `${d.delaySec}s`,
              } as React.CSSProperties
            }
          />
        )
      })}
    </div>
  )
}
