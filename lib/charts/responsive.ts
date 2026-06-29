"use client"

import {
  type RefObject,
  useLayoutEffect,
  useState,
} from "react"

function heightForWidth(width: number): number {
  if (width < 480) return 260
  if (width < 768) return 320
  return 380
}

/**
 * Reactive chart height from container width (ResizeObserver).
 * - &lt; 480px → 260px
 * - 480–768px → 320px
 * - &gt; 768px → 380px
 */
export function useResponsiveChartHeight(
  containerRef: RefObject<HTMLElement | null>
): number {
  const [height, setHeight] = useState(380)

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el || typeof ResizeObserver === "undefined") return

    const apply = (width: number) => {
      if (width <= 0) {
        requestAnimationFrame(() => {
          const w = el.getBoundingClientRect().width
          if (w > 0) setHeight(heightForWidth(w))
        })
        return
      }
      setHeight(heightForWidth(width))
    }

    apply(el.getBoundingClientRect().width)

    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w != null) apply(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [containerRef])

  return height
}

const ELLIPSIS = "\u2026"

/**
 * Truncates axis/legend labels; result length is at most `maxChars` (including ellipsis).
 */
export function truncateLabel(label: string | undefined | null, maxChars = 16): string {
  if (maxChars < 1) return ""
  const text = label == null ? "" : String(label)
  if (text.length <= maxChars) return text
  if (maxChars === 1) return ELLIPSIS
  return `${text.slice(0, maxChars - 1)}${ELLIPSIS}`
}
