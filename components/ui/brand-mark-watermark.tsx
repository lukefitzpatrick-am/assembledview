import * as React from "react"

import { BRAND_MARK_COLOURS, BRAND_MARK_GRID } from "@/lib/brand/brandMarkColours"
import { cn } from "@/lib/utils"

export type BrandMarkWatermarkProps = React.HTMLAttributes<HTMLDivElement> & {
  /** Overall mark size in px (default 120). */
  size?: number
}

/**
 * Decorative 3×3 Assembled pixel-grid brand mark for page hero watermarks.
 * Absolutely position within a `relative overflow-hidden` parent.
 */
export function BrandMarkWatermark({ className, size = 120, ...props }: BrandMarkWatermarkProps) {
  const gap = Math.max(2, Math.round(size * 0.025))
  const cellSize = (size - gap * 2) / 3

  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute top-1/2 z-0 -translate-y-1/2 opacity-[0.16] dark:opacity-[0.22]",
        className,
      )}
      style={{ width: size, height: size, right: -size * 0.18 }}
      {...props}
    >
      <div
        className="grid h-full w-full"
        style={{
          gridTemplateColumns: `repeat(3, ${cellSize}px)`,
          gridTemplateRows: `repeat(3, ${cellSize}px)`,
          gap,
        }}
      >
        {BRAND_MARK_GRID.flat().map((key, index) => (
          <span
            key={index}
            className="rounded-[2px]"
            style={{
              width: cellSize,
              height: cellSize,
              backgroundColor: BRAND_MARK_COLOURS[key],
            }}
          />
        ))}
      </div>
    </div>
  )
}
