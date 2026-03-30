"use client"

import {
  type RefObject,
  useLayoutEffect,
  useState,
} from "react"
import type { XAxisProps } from "recharts"

import { AXIS_CONFIG } from "@/lib/charts/dashboardTheme"

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

/** Single ResizeObserver: chart width plus height from {@link heightForWidth}. */
export function useResponsiveChartBox(
  containerRef: RefObject<HTMLElement | null>
): { width: number; height: number } {
  const [width, setWidth] = useState(0)
  const [height, setHeight] = useState(380)

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el || typeof ResizeObserver === "undefined") return

    const apply = (w: number) => {
      if (w <= 0) {
        requestAnimationFrame(() => {
          const next = el.getBoundingClientRect().width
          if (next > 0) {
            setWidth(next)
            setHeight(heightForWidth(next))
          }
        })
        return
      }
      setWidth(w)
      setHeight(heightForWidth(w))
    }

    apply(el.getBoundingClientRect().width)

    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w != null) apply(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [containerRef])

  return { width, height }
}

/**
 * Observes an element's content box (width + height). Use for Recharts pies so radii
 * follow the actual plot cell after flex/grid layout (avoids overflow when the slot
 * is wider than it is tall or vice versa).
 */
export function useObservedSize(
  elementRef: RefObject<HTMLElement | null>
): { width: number; height: number } {
  const [size, setSize] = useState({ width: 0, height: 0 })

  useLayoutEffect(() => {
    const el = elementRef.current
    if (!el || typeof ResizeObserver === "undefined") return

    const apply = () => {
      const r = el.getBoundingClientRect()
      setSize({ width: r.width, height: r.height })
    }

    apply()
    requestAnimationFrame(apply)

    const ro = new ResizeObserver(() => apply())
    ro.observe(el)
    return () => ro.disconnect()
  }, [elementRef])

  return size
}

export type ResponsiveXAxisConfig = Pick<
  XAxisProps,
  "angle" | "textAnchor" | "height" | "interval" | "tick"
>

/**
 * Recharts {@link XAxis} props for label density and rotation, using {@link AXIS_CONFIG} tick styling.
 */
export function getXAxisConfig(
  labelCount: number,
  containerWidth: number
): ResponsiveXAxisConfig {
  const tick = { ...AXIS_CONFIG.tickStyle }
  const wouldOverlap =
    labelCount > 0 &&
    containerWidth > 0 &&
    containerWidth / labelCount < 50
  const shouldRotate = labelCount > 12 || wouldOverlap

  const base: ResponsiveXAxisConfig = { tick }

  if (shouldRotate) {
    base.angle = AXIS_CONFIG.rotateAngle
    base.textAnchor = "end"
    base.height = AXIS_CONFIG.rotateHeight
  } else {
    base.angle = 0
    base.textAnchor = "middle"
    base.height = 30
  }

  if (labelCount > 20) {
    base.interval = Math.ceil(labelCount / 15)
  }

  return base
}

/**
 * Keeps the largest `maxSeries - 1` rows by {@link valueKey}, merges the rest into one `"Other"` row.
 */
export function condenseSeriesData<T extends Record<string, unknown>>(
  data: T[],
  valueKey: string,
  nameKey: string,
  maxSeries = 10
): T[] {
  if (data.length <= maxSeries) return data

  const sorted = [...data].sort(
    (a, b) =>
      (Number(b[valueKey]) || 0) - (Number(a[valueKey]) || 0)
  )
  const top = sorted.slice(0, maxSeries - 1)
  const rest = sorted.slice(maxSeries - 1)
  const otherSum = rest.reduce(
    (s, row) => s + (Number(row[valueKey]) || 0),
    0
  )
  const template = rest[0] ?? sorted[0]!
  const other = {
    ...template,
    [nameKey]: "Other",
    [valueKey]: otherSum,
  } as T

  return [...top, other]
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
