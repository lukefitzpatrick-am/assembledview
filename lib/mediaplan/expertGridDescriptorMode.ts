/**
 * Compact / expanded descriptor pane for ExpertGrid (SM-13 / SM-14).
 * Pure hysteresis + resolve — no DOM. Auto-mode reads logical scroll
 * (week travel in expanded coordinates), never the post-compact raw
 * scrollLeft that the width change itself writes.
 */

export type ExpertGridDescriptorMode = "expanded" | "compact"

/** Logical scroll above this → compact (strict greater-than). */
export const DESCRIPTOR_COMPACT_SCROLL_PX = 160
/** Logical scroll below this → expanded (strict less-than). */
export const DESCRIPTOR_EXPAND_SCROLL_PX = 40
/** Ignore scroll events for ~2 frames after a compensation write. */
export const DESCRIPTOR_SCROLL_SUPPRESS_MS = 34
/** SM-16: auto-compact off pending live measurement. Pin-compact still works. */
export const DESCRIPTOR_AUTO_COMPACT_ENABLED = false

export type DescriptorStickyWidths = {
  expandedStickyWidthPx: number
  compactStickyWidthPx: number
  currentStickyWidthPx: number
}

export type DescriptorScrollerMetrics = {
  scrollWidth: number
  clientWidth: number
}

/** Week-grid travel in expanded coordinates. */
export function descriptorLogicalScrollLeft(
  scrollLeft: number,
  expandedStickyWidthPx: number,
  currentStickyWidthPx: number
): number {
  return scrollLeft + (expandedStickyWidthPx - currentStickyWidthPx)
}

/**
 * Compact is only allowed when the weeks stay scrolled after shrinking
 * the pane by W = expanded − compact:
 *   expandedMaxScroll − W ≥ DESCRIPTOR_COMPACT_SCROLL_PX
 */
export function canCompact(
  el: DescriptorScrollerMetrics,
  widths: DescriptorStickyWidths
): boolean {
  const W = widths.expandedStickyWidthPx - widths.compactStickyWidthPx
  if (W <= 0) return false
  const expandedScrollWidth =
    el.scrollWidth + (widths.expandedStickyWidthPx - widths.currentStickyWidthPx)
  const expandedMaxScroll = expandedScrollWidth - el.clientWidth
  return expandedMaxScroll - W >= DESCRIPTOR_COMPACT_SCROLL_PX
}

export function shouldSuppressDescriptorScrollEvent(
  now: number,
  suppressUntil: number
): boolean {
  return now < suppressUntil
}

export function nextDescriptorScrollSuppressUntil(now: number): number {
  return now + DESCRIPTOR_SCROLL_SUPPRESS_MS
}

export const DESCRIPTOR_PIN_STORAGE_PREFIX = "eg-descriptor-pin:"

export function descriptorPinStorageKey(channelKey: string): string {
  return `${DESCRIPTOR_PIN_STORAGE_PREFIX}${channelKey}`
}

/**
 * Hysteresis band on logical scroll. `compactAllowed` is {@link canCompact}.
 */
export function nextDescriptorScrollIntent(
  current: ExpertGridDescriptorMode,
  logicalScroll: number,
  compactAllowed: boolean = true
): ExpertGridDescriptorMode {
  if (!compactAllowed) return "expanded"
  if (logicalScroll > DESCRIPTOR_COMPACT_SCROLL_PX) return "compact"
  if (logicalScroll < DESCRIPTOR_EXPAND_SCROLL_PX) return "expanded"
  return current
}

/**
 * One auto-mode step from scroller numbers. Compensation writes are
 * ignored until `suppressUntil`. Compact scrollLeft below the expand
 * threshold still expands: logical is ≥ W while compact, so 40 logical
 * px is unreachable from the compact scroller's left edge.
 */
export function applyDescriptorScrollEvent(args: {
  current: ExpertGridDescriptorMode
  scrollLeft: number
  scrollWidth: number
  clientWidth: number
  expandedStickyWidthPx: number
  compactStickyWidthPx: number
  currentStickyWidthPx: number
  now: number
  suppressUntil: number
}): { mode: ExpertGridDescriptorMode; ignored: boolean } {
  if (shouldSuppressDescriptorScrollEvent(args.now, args.suppressUntil)) {
    return { mode: args.current, ignored: true }
  }
  const compactAllowed = canCompact(
    { scrollWidth: args.scrollWidth, clientWidth: args.clientWidth },
    {
      expandedStickyWidthPx: args.expandedStickyWidthPx,
      compactStickyWidthPx: args.compactStickyWidthPx,
      currentStickyWidthPx: args.currentStickyWidthPx,
    }
  )
  const logicalScroll = descriptorLogicalScrollLeft(
    args.scrollLeft,
    args.expandedStickyWidthPx,
    args.currentStickyWidthPx
  )
  let mode = nextDescriptorScrollIntent(
    args.current,
    logicalScroll,
    compactAllowed
  )
  if (
    args.current === "compact" &&
    args.scrollLeft < DESCRIPTOR_EXPAND_SCROLL_PX
  ) {
    mode = "expanded"
  }
  return { mode, ignored: false }
}

/**
 * Resolution: focusWithin / errorWithin → expanded; then pinned; then auto.
 * When auto-compact is off and pinned is null, stay expanded regardless of `auto`.
 */
export function resolveExpertGridDescriptorMode(args: {
  focusWithin: boolean
  errorWithin: boolean
  pinned: boolean | null
  auto: ExpertGridDescriptorMode
}): ExpertGridDescriptorMode {
  if (args.focusWithin || args.errorWithin) return "expanded"
  if (args.pinned === true) return "expanded"
  if (args.pinned === false) return "compact"
  if (!DESCRIPTOR_AUTO_COMPACT_ENABLED) return "expanded"
  return args.auto
}

/** Click cycle: auto → pin expanded → pin compact → auto. */
export function nextDescriptorPin(current: boolean | null): boolean | null {
  if (current === null) return true
  if (current === true) return false
  return null
}

export function parseDescriptorPin(raw: string | null | undefined): boolean | null {
  if (raw === "true") return true
  if (raw === "false") return false
  return null
}

export function serializeDescriptorPin(pinned: boolean | null): string | null {
  if (pinned === true) return "true"
  if (pinned === false) return "false"
  return null
}

/**
 * Keep the week under the pointer still when sticky pane width changes:
 * newScrollLeft = clamp(scrollLeft + Δ, 0, maxScroll).
 */
export function adjustScrollLeftForDescriptorWidthChange(
  scrollLeft: number,
  prevStickyWidthPx: number,
  nextStickyWidthPx: number,
  maxScroll: number = Number.POSITIVE_INFINITY
): number {
  const next = scrollLeft + (nextStickyWidthPx - prevStickyWidthPx)
  const max = Math.max(0, maxScroll)
  if (next < 0) return 0
  if (next > max) return max
  return next
}

const INCOMPLETE_REASON_TO_FIELD: Record<string, string> = {
  "Buy type": "buyType",
  Publisher: "publisher",
  Platform: "platform",
  Network: "network",
  Station: "station",
  Site: "site",
  "Media type": "mediaType",
}

/**
 * Incomplete descriptor fields that would be zero-width in compact must
 * force expanded (same as focus / a validation ring).
 */
export function descriptorErrorForcesExpand(
  compactWidths: readonly number[],
  widthKeys: readonly string[],
  incompleteReasons: readonly string[]
): boolean {
  for (const reason of incompleteReasons) {
    const key = INCOMPLETE_REASON_TO_FIELD[reason]
    if (!key) continue
    const i = widthKeys.indexOf(key)
    if (i >= 0 && (compactWidths[i] ?? 0) === 0) return true
  }
  return false
}
