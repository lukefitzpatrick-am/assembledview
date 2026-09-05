/**
 * Compact / expanded descriptor pane for ExpertGrid (SM-13).
 * Pure hysteresis + resolve — no DOM.
 */

export type ExpertGridDescriptorMode = "expanded" | "compact"

/** scrollLeft above this → compact (strict greater-than). */
export const DESCRIPTOR_COMPACT_SCROLL_PX = 160
/** scrollLeft below this → expanded (strict less-than). */
export const DESCRIPTOR_EXPAND_SCROLL_PX = 40

export const DESCRIPTOR_PIN_STORAGE_PREFIX = "eg-descriptor-pin:"

export function descriptorPinStorageKey(channelKey: string): string {
  return `${DESCRIPTOR_PIN_STORAGE_PREFIX}${channelKey}`
}

/**
 * Hysteresis band: between expand and compact thresholds, keep `current`.
 */
export function nextDescriptorScrollIntent(
  current: ExpertGridDescriptorMode,
  scrollLeft: number
): ExpertGridDescriptorMode {
  if (scrollLeft > DESCRIPTOR_COMPACT_SCROLL_PX) return "compact"
  if (scrollLeft < DESCRIPTOR_EXPAND_SCROLL_PX) return "expanded"
  return current
}

/**
 * Resolution: focusWithin / errorWithin → expanded; then pinned; then auto.
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
 * newScrollLeft = scrollLeft + (nextStickyWidth − prevStickyWidth).
 */
export function adjustScrollLeftForDescriptorWidthChange(
  scrollLeft: number,
  prevStickyWidthPx: number,
  nextStickyWidthPx: number
): number {
  return scrollLeft + (nextStickyWidthPx - prevStickyWidthPx)
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
