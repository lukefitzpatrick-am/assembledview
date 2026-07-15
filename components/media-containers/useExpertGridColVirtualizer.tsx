"use client"

import { useEffect, useMemo, useState } from "react"

import {
  EXPERT_GRID_COL_OVERSCAN_DEFAULT,
  expandColRangeForMerges,
  expertGridColSpacerWidths,
  expectedMountedColRange,
  type ExpertMergeSpanKeys,
} from "@/lib/mediaplan/oohExpertVirtualization"

export type UseExpertGridColVirtualizerArgs = {
  /** Per-week column widths in px (expanded weeks already collapsed to one width). */
  widthsPx: readonly number[]
  weekKeys: readonly string[]
  getScrollElement: () => HTMLElement | null
  overscan?: number
  /** When false, returns the full [0..n-1] range (no windowing). */
  enabled?: boolean
  /** Merge spans across all rows — expands the window so colSpans stay coherent. */
  mergeSpans?: readonly ExpertMergeSpanKeys[]
  /**
   * Sticky-left block width in px (reorder + descriptor columns). Sticky cells
   * stay mounted in the table before the week-band spacer — they are NOT added
   * into `paddingLeft`. This value only shrinks the effective viewport used to
   * choose which week columns mount so the first visible week starts at the
   * sticky boundary.
   */
  stickyLeftWidthPx?: number
}

export type ExpertGridColVirtualizerResult = {
  colStart: number
  colEnd: number
  paddingLeft: number
  paddingRight: number
  /** Inclusive week indices in the mounted window (empty when n=0). */
  mountedWeekIndices: number[]
}

/**
 * Horizontal week-column window for expert grids (OOH Phase 2 column prototype).
 *
 * Shares the same overflow scroller as row virtualization. Sticky descriptor
 * geometry stays fully mounted; only the week band after the sticky boundary is
 * windowed. Left/right spacer cells preserve the week-band scroll width — they
 * must not re-include sticky width (that would double-count and drift the first
 * week away from the boundary).
 */
export function useExpertGridColVirtualizer({
  widthsPx,
  weekKeys,
  getScrollElement,
  overscan = EXPERT_GRID_COL_OVERSCAN_DEFAULT,
  enabled = true,
  mergeSpans = [],
  stickyLeftWidthPx = 0,
}: UseExpertGridColVirtualizerArgs): ExpertGridColVirtualizerResult {
  const [scrollLeft, setScrollLeft] = useState(0)
  const [viewportWidth, setViewportWidth] = useState(0)

  useEffect(() => {
    const el = getScrollElement()
    if (!el || !enabled) return

    let raf = 0
    const sync = () => {
      setScrollLeft(el.scrollLeft)
      setViewportWidth(el.clientWidth)
    }
    const onScroll = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        sync()
      })
    }
    sync()
    el.addEventListener("scroll", onScroll, { passive: true })
    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => sync())
        : null
    ro?.observe(el)
    return () => {
      el.removeEventListener("scroll", onScroll)
      if (raf) cancelAnimationFrame(raf)
      ro?.disconnect()
    }
    // Intentionally depend on widths/length/enabled — getScrollElement is a stable
    // ref-read thunk from callers (`() => gridScrollRef.current`).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
  }, [enabled, widthsPx.length])

  return useMemo(() => {
    const n = widthsPx.length
    if (n === 0) {
      return {
        colStart: 0,
        colEnd: -1,
        paddingLeft: 0,
        paddingRight: 0,
        mountedWeekIndices: [],
      }
    }
    if (!enabled) {
      return {
        colStart: 0,
        colEnd: n - 1,
        paddingLeft: 0,
        paddingRight: 0,
        mountedWeekIndices: Array.from({ length: n }, (_, i) => i),
      }
    }
    // Sticky columns occupy the left of the viewport; week-band visibility is
    // the remaining width. scrollLeft already tracks week-band progress because
    // sticky cells are laid out before the week spacer in the table.
    const weekViewportWidth = Math.max(
      0,
      (viewportWidth || 800) - Math.max(0, stickyLeftWidthPx)
    )
    let range = expectedMountedColRange(
      scrollLeft,
      weekViewportWidth,
      widthsPx,
      overscan
    )
    if (mergeSpans.length > 0) {
      range = expandColRangeForMerges(range, weekKeys, mergeSpans)
    }
    const { paddingLeft, paddingRight } = expertGridColSpacerWidths(
      range,
      widthsPx
    )
    const mountedWeekIndices: number[] = []
    for (let i = range.start; i <= range.end; i++) mountedWeekIndices.push(i)
    return {
      colStart: range.start,
      colEnd: range.end,
      paddingLeft,
      paddingRight,
      mountedWeekIndices,
    }
  }, [
    enabled,
    mergeSpans,
    overscan,
    scrollLeft,
    stickyLeftWidthPx,
    viewportWidth,
    weekKeys,
    widthsPx,
  ])
}
