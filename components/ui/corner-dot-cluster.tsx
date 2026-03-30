import * as React from "react"

import { cn } from "@/lib/utils"

const BRAND = {
  green: "#C5D82D",
  cyan: "#00CED1",
  pink: "#FF69B4",
  orange: "#FF6600",
} as const

/** Approximate distance from top-left; larger dots nearer the corner. */
const DOTS: Array<{
  left: number
  top: number
  size: number
  color: string
  opacityMin: number
  delaySec: number
}> = [
  { left: 8, top: 8, size: 30, color: BRAND.green, opacityMin: 0.52, delaySec: 0 },
  { left: 44, top: 4, size: 21, color: BRAND.cyan, opacityMin: 0.45, delaySec: 0.23 },
  { left: 6, top: 40, size: 25, color: BRAND.pink, opacityMin: 0.4, delaySec: 0.46 },
  { left: 32, top: 32, size: 17, color: BRAND.orange, opacityMin: 0.55, delaySec: 0.69 },
  { left: 62, top: 16, size: 10, color: BRAND.green, opacityMin: 0.48, delaySec: 0.92 },
  { left: 48, top: 48, size: 7, color: BRAND.cyan, opacityMin: 0.6, delaySec: 1.15 },
  { left: 22, top: 54, size: 13, color: BRAND.pink, opacityMin: 0.42, delaySec: 1.38 },
  { left: 76, top: 6, size: 5, color: BRAND.orange, opacityMin: 0.5, delaySec: 1.6 },
]

const KEYFRAMES_ID = "corner-dot-cluster-pulse-kf"

export type CornerDotClusterProps = React.HTMLAttributes<HTMLDivElement>

/**
 * Decorative Assembled-style dot cluster for the top-left corner of a relatively positioned parent.
 */
export function CornerDotCluster({ className, ...props }: CornerDotClusterProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute left-[-6px] top-[-6px] z-0",
        // Room for the outermost dot positions + largest diameter
        "h-[72px] w-[96px]",
        className
      )}
      {...props}
    >
      <style
        dangerouslySetInnerHTML={{
          __html: `
@keyframes ${KEYFRAMES_ID} {
  0%, 100% {
    transform: scale(1);
    opacity: var(--cdc-o-min);
  }
  50% {
    transform: scale(1.12);
    opacity: var(--cdc-o-max);
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
                left: d.left,
                top: d.top,
                width: d.size,
                height: d.size,
                marginLeft: -d.size / 2,
                marginTop: -d.size / 2,
                backgroundColor: d.color,
                willChange: "transform, opacity",
                transformOrigin: "center",
                ["--cdc-o-min" as string]: d.opacityMin,
                ["--cdc-o-max" as string]: opacityMax,
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
