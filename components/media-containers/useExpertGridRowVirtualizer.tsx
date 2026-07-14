"use client"

import {
  useVirtualizer,
  type VirtualItem,
  type Virtualizer,
} from "@tanstack/react-virtual"
import type { ReactNode } from "react"

import {
  EXPERT_GRID_ROW_OVERSCAN_DEFAULT,
  expertGridVirtualSpacerPaddings,
} from "@/lib/mediaplan/oohExpertVirtualization"

export {
  EXPERT_GRID_ROW_OVERSCAN_DEFAULT,
  expertGridVirtualSpacerPaddings,
} from "@/lib/mediaplan/oohExpertVirtualization"
export type UseExpertGridRowVirtualizerArgs = {
  count: number
  getScrollElement: () => HTMLElement | null
  /**
   * Fixed row height (px), or a per-index estimator. Expert grids use a fixed
   * height + no `measureElement` (see OOH hardening).
   */
  estimateSize: number | ((index: number) => number)
  overscan?: number
  /**
   * Offset of the virtual body within the scroll element (typically measured
   * `<thead>` height). Passed through to TanStack as `scrollMargin` and
   * `scrollPaddingStart` so ranges and `scrollToIndex` clear the sticky header.
   * Channel-specific — each grid measures its own header and passes it in.
   */
  scrollMargin?: number
  scrollPaddingStart?: number
}

export type ExpertGridRowVirtualizerResult = {
  virtualizer: Virtualizer<HTMLElement, Element>
  virtualItems: VirtualItem[]
  /** Top spacer height (px) for the padding-`<tr>` technique inside `<tbody>`. */
  paddingTop: number
  /** Bottom spacer height (px). */
  paddingBottom: number
  scrollToIndex: Virtualizer<HTMLElement, Element>["scrollToIndex"]
}

/**
 * Shared expert-grid row virtualizer (F-28 Phase 2).
 *
 * Wraps `@tanstack/react-virtual` and exposes the padding-`<tr>` numbers OOH
 * already uses — preserves `<table>` semantics and sticky columns. Row cells
 * stay channel-owned (`MemoExpertGridRow` + grid render).
 */
export function useExpertGridRowVirtualizer({
  count,
  getScrollElement,
  estimateSize,
  overscan = EXPERT_GRID_ROW_OVERSCAN_DEFAULT,
  scrollMargin = 0,
  scrollPaddingStart,
}: UseExpertGridRowVirtualizerArgs): ExpertGridRowVirtualizerResult {
  const sizeFn =
    typeof estimateSize === "number" ? () => estimateSize : estimateSize

  const virtualizer = useVirtualizer({
    count,
    getScrollElement,
    estimateSize: sizeFn,
    overscan,
    scrollMargin,
    scrollPaddingStart:
      scrollPaddingStart !== undefined ? scrollPaddingStart : scrollMargin,
  })

  const virtualItems = virtualizer.getVirtualItems()
  const { paddingTop, paddingBottom } = expertGridVirtualSpacerPaddings(
    virtualItems,
    virtualizer.getTotalSize(),
    scrollMargin
  )

  return {
    virtualizer,
    virtualItems,
    paddingTop,
    paddingBottom,
    scrollToIndex: virtualizer.scrollToIndex.bind(virtualizer),
  }
}

export type ExpertGridVirtualSpacerBodyProps = {
  /**
   * Must equal the channel's thead/totals column count (reorder + descriptors +
   * week/day cells). OOH computes this from expanded weeks — pass as a param;
   * do not bake channel layout into this helper.
   */
  colSpan: number
  paddingTop: number
  paddingBottom: number
  /** Mounted schedule rows for the current virtual window. */
  children: ReactNode
}

/**
 * Top/bottom `<tr aria-hidden>` spacers around the mounted row window — the
 * same padding-`<tr>` technique OOH uses (table semantics + sticky columns).
 */
export function ExpertGridVirtualSpacerBody({
  colSpan,
  paddingTop,
  paddingBottom,
  children,
}: ExpertGridVirtualSpacerBodyProps) {
  return (
    <>
      {paddingTop > 0 ? (
        <tr aria-hidden style={{ height: paddingTop }}>
          <td
            colSpan={colSpan}
            style={{
              height: paddingTop,
              padding: 0,
              border: 0,
            }}
          />
        </tr>
      ) : null}
      {children}
      {paddingBottom > 0 ? (
        <tr aria-hidden style={{ height: paddingBottom }}>
          <td
            colSpan={colSpan}
            style={{
              height: paddingBottom,
              padding: 0,
              border: 0,
            }}
          />
        </tr>
      ) : null}
    </>
  )
}
