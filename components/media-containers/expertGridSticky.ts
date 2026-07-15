/**
 * Shared sticky-left geometry + opaque surface classes for expert weekly grids.
 *
 * Sticky descriptor styles were historically copy-pasted per ExpertGrid; keep
 * them here so every channel inherits the same left offsets, z-order, and
 * solid fills (no backdrop-blur bleed-through over scrolling week cells).
 */

import type { CSSProperties } from "react"

import { EXPERT_REORDER_COL_WIDTH_PX } from "@/components/media-containers/ExpertGridRowReorderCell"
import { cn } from "@/lib/utils"

/**
 * Opaque sticky surfaces. Never use backdrop-blur / translucent fills here —
 * scrolling week cells must not show through.
 *
 * Zebra + hover track the schedule `<tr>` via `group/egrow` + `data-eg-zebra`
 * (see {@link EXPERT_GRID_ROW_CLASS}).
 */
export const EXPERT_GRID_STICKY_BG = "bg-background"
export const EXPERT_GRID_STICKY_BG_HOVER =
  "group-hover/egrow:bg-table-row-hover group-focus-within/egrow:bg-table-row-hover"
export const EXPERT_GRID_STICKY_BG_ZEBRA =
  "group-data-[eg-zebra]/egrow:bg-muted"

/** Schedule row chrome: group + opaque hover for non-sticky week cells. */
export const EXPERT_GRID_ROW_CLASS =
  "group/egrow transition-colors hover:bg-table-row-hover focus-within:bg-table-row-hover"

/** Week body cells sit below sticky-left descriptors. */
export const EXPERT_GRID_WEEK_BODY_Z = "relative z-0"

const STICKY_TH_CORNER_BASE =
  "sticky top-0 z-[60] border-b border-r bg-background px-1.5 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground shadow-[0_1px_0_0_hsl(var(--border))]"

const STICKY_TH_WEEK_BASE =
  "sticky top-0 z-[55] border-b border-r bg-background px-1 py-3.5 text-center text-muted-foreground shadow-[0_1px_0_0_hsl(var(--border))] align-middle"

const STICKY_TD_BASE = cn(
  "border-b border-r bg-background px-1 py-0 align-middle overflow-hidden",
  EXPERT_GRID_STICKY_BG_ZEBRA,
  EXPERT_GRID_STICKY_BG_HOVER
)

export function cumulativeLeftOffsets(widths: readonly number[]): number[] {
  const out: number[] = []
  let acc = 0
  for (const w of widths) {
    out.push(acc)
    acc += w
  }
  return out
}

/** Full sticky-left width: reorder grip + every sticky descriptor column. */
export function expertGridStickyLeftWidthPx(
  descriptorColWidths: readonly number[],
  reorderColWidthPx: number = EXPERT_REORDER_COL_WIDTH_PX
): number {
  let total = reorderColWidthPx
  for (const w of descriptorColWidths) total += Math.max(0, w)
  return total
}

export function expertGridStickyThCorner(className?: string): string {
  return cn(STICKY_TH_CORNER_BASE, className)
}

export function expertGridStickyThWeek(className?: string): string {
  return cn(STICKY_TH_WEEK_BASE, className)
}

/** Sticky body descriptor / reorder / totals footer cell classes. */
export function expertGridStickyTd(className?: string): string {
  return cn(STICKY_TD_BASE, className)
}

/** Odd-row zebra marker for {@link EXPERT_GRID_STICKY_BG_ZEBRA}. */
export function expertGridRowZebraProps(rowIndex: number): {
  "data-eg-zebra"?: ""
} {
  return rowIndex % 2 === 1 ? { "data-eg-zebra": "" } : {}
}

export function expertGridStickyStyleBody(
  index: number,
  leftOffsets: readonly number[],
  descriptorColWidths: readonly number[],
  reorderColWidthPx: number = EXPERT_REORDER_COL_WIDTH_PX
): CSSProperties {
  const width = descriptorColWidths[index]
  return {
    position: "sticky",
    left: reorderColWidthPx + (leftOffsets[index] ?? 0),
    // Above scrolling week body (z-0); below sticky header corners (70+) and
    // reorder (40 body / 80 header).
    zIndex: 20 + Math.min(index, 20),
    width,
    minWidth: width,
    maxWidth: width,
    boxSizing: "border-box",
  }
}

export function expertGridStickyStyleHeaderCorner(
  index: number,
  leftOffsets: readonly number[],
  descriptorColWidths: readonly number[],
  reorderColWidthPx: number = EXPERT_REORDER_COL_WIDTH_PX
): CSSProperties {
  const width = descriptorColWidths[index]
  return {
    position: "sticky",
    left: reorderColWidthPx + (leftOffsets[index] ?? 0),
    zIndex: 70 + Math.min(index, 20),
    width,
    minWidth: width,
    maxWidth: width,
    boxSizing: "border-box",
  }
}

export function expertGridStickyStyleReorderBody(): CSSProperties {
  return {
    position: "sticky",
    left: 0,
    zIndex: 40,
  }
}

export function expertGridStickyStyleReorderHeader(): CSSProperties {
  return {
    position: "sticky",
    left: 0,
    zIndex: 80,
  }
}

export function expertGridStickyStyleDescriptorTotalLabel(
  descriptorStickyBlockWidthPx: number,
  reorderColWidthPx: number = EXPERT_REORDER_COL_WIDTH_PX
): CSSProperties {
  return {
    position: "sticky",
    left: reorderColWidthPx,
    zIndex: 30,
    width: descriptorStickyBlockWidthPx,
    minWidth: descriptorStickyBlockWidthPx,
    maxWidth: descriptorStickyBlockWidthPx,
    boxSizing: "border-box",
  }
}
