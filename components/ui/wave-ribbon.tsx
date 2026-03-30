"use client"

import * as React from "react"

import { cn, hexToRgba } from "@/lib/utils"

export interface WaveRibbonProps {
  brandColour: string
  className?: string
}

/**
 * Two crests across 600 units; flat base at y=200. Same command structure for SMIL morphing.
 */
const PRIMARY_WAVES = [
  "M0,200 L0,128 C100,102 200,102 300,128 C400,154 500,154 600,128 L600,200 Z",
  "M0,200 L0,118 C100,92 200,92 300,118 C400,144 500,144 600,118 L600,200 Z",
  "M0,200 L0,136 C100,112 200,112 300,136 C400,162 500,162 600,136 L600,200 Z",
] as const

/** Slightly higher (smaller y) and independent motion for parallax. */
const SECONDARY_WAVES = [
  "M0,200 L0,114 C100,88 200,88 300,114 C400,140 500,140 600,114 L600,200 Z",
  "M0,200 L0,104 C100,78 200,78 300,104 C400,130 500,130 600,104 L600,200 Z",
  "M0,200 L0,122 C100,98 200,98 300,122 C400,148 500,148 600,122 L600,200 Z",
] as const

function morphValues(a: string, b: string, c: string): string {
  return `${a};${b};${c};${a}`
}

const PRIMARY_D_VALUES = morphValues(...PRIMARY_WAVES)
const SECONDARY_D_VALUES = morphValues(...SECONDARY_WAVES)

/**
 * Animated brand-tinted SVG waves anchored to the bottom-right of a relatively positioned parent.
 */
export function WaveRibbon({ brandColour, className }: WaveRibbonProps) {
  const uid = React.useId().replace(/:/g, "")
  const gradPrimaryId = `wave-ribbon-p-${uid}`
  const gradSecondaryId = `wave-ribbon-s-${uid}`

  return (
    <div
      aria-hidden="true"
      className={cn("pointer-events-none absolute bottom-0 right-0 h-full w-[62%]", className)}
    >
      <svg
        className="h-full w-full"
        viewBox="0 0 600 200"
        preserveAspectRatio="none"
        focusable="false"
      >
        <defs>
          <linearGradient
            id={gradPrimaryId}
            gradientUnits="userSpaceOnUse"
            x1="0"
            y1="0"
            x2="600"
            y2="0"
          >
            <stop offset="0%" stopColor={hexToRgba(brandColour, 0.04)} />
            <stop offset="40%" stopColor={hexToRgba(brandColour, 0.1)} />
            <stop offset="100%" stopColor={hexToRgba(brandColour, 0.18)} />
          </linearGradient>
          <linearGradient
            id={gradSecondaryId}
            gradientUnits="userSpaceOnUse"
            x1="0"
            y1="0"
            x2="600"
            y2="0"
          >
            <stop offset="0%" stopColor={hexToRgba(brandColour, 0.02)} />
            <stop offset="50%" stopColor={hexToRgba(brandColour, 0.07)} />
            <stop offset="100%" stopColor={hexToRgba(brandColour, 0.12)} />
          </linearGradient>
        </defs>
        <path d={SECONDARY_WAVES[0]} fill={`url(#${gradSecondaryId})`} opacity={0.72}>
          <animate
            attributeName="d"
            dur="12s"
            repeatCount="indefinite"
            calcMode="linear"
            begin="-4.5s"
            keyTimes="0;0.333333;0.666666;1"
            values={SECONDARY_D_VALUES}
          />
        </path>
        <path d={PRIMARY_WAVES[0]} fill={`url(#${gradPrimaryId})`}>
          <animate
            attributeName="d"
            dur="9s"
            repeatCount="indefinite"
            calcMode="linear"
            keyTimes="0;0.333333;0.666666;1"
            values={PRIMARY_D_VALUES}
          />
        </path>
      </svg>
    </div>
  )
}
