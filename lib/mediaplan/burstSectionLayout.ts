/**
 * Shared burst row layout tokens — aligned to TelevisionContainer burst rows.
 * Field labels and form paths stay in each container; only layout classes live here.
 */

/** Outer wrapper between line-item body and burst cards (Television: space-y-4). */
export const MP_BURST_SECTION_OUTER = "space-y-4"

/** Burst index / date label column; width must match across rows. */
export const MP_BURST_LABEL_COLUMN = "w-24 flex-shrink-0"

/** Actions cluster: outline buttons, bottom-aligned with inputs (Television). */
export const MP_BURST_ACTION_COLUMN =
  "flex items-end gap-2 self-end pb-1 shrink-0"

export const MP_BURST_CARD =
  "mx-2 rounded-card border border-border bg-surface-muted shadow-e0"

export const MP_BURST_CARD_CONTENT = "py-2 px-4"

/** @deprecated Header row removed — Television uses inline field labels per row. */
export const MP_BURST_HEADER_SHELL =
  "w-full rounded-t-lg border-b border-border/50 bg-gradient-to-r from-muted/60 to-muted/30 sticky top-0 z-10 backdrop-blur-sm"

/** @deprecated */
export const MP_BURST_HEADER_INNER = "flex items-end gap-3 px-4 py-1.5"

/** @deprecated */
export const MP_BURST_HEADER_ROW = "flex min-h-10 min-w-0 flex-1 items-center gap-3"

/** Standard burst row shell for label + input grid + actions. */
export const MP_BURST_ROW_SHELL = "flex items-center gap-3"

/** Burst row label heading typography (Television: text-sm font-medium). */
export const MP_BURST_LABEL_HEADING = "text-sm font-medium m-0 leading-tight"

/** Inline field label above each burst input (Television: text-xs). */
export const MP_BURST_FIELD_LABEL = "text-xs"

/** Start/end date pair inside the 7-column grid. */
export const MP_BURST_DATE_RANGE = "grid grid-cols-2 gap-2 col-span-2"

/** Editable money / text inputs in burst rows. */
export const MP_BURST_INPUT = "w-full min-w-[9rem] h-10 text-sm"

/** Read-only computed Media / Fee cells. */
export const MP_BURST_READONLY_INPUT = "w-full h-10 text-sm"

/** Read-only cells on migrated containers (muted treatment). */
export const MP_BURST_READONLY_MUTED =
  "w-full h-10 text-sm bg-muted/30 border-border/40 text-muted-foreground"

/** Wrapper for read-only metric with label (Media, Fee). */
export const MP_BURST_READONLY_CELL = "space-y-1"

/** Data grid: Budget, Buy, Start+End, calculated, Media, Fee. */
export const MP_BURST_GRID_7 =
  "grid grid-cols-7 gap-3 items-center flex-grow min-w-0"

/** Digital CPC/CPV/Fixed with ad-serving override column. */
export const MP_BURST_GRID_8 =
  "grid grid-cols-8 gap-3 items-center flex-grow min-w-0"

/** Production: Cost, Quantity, Start+End, Production Total. */
export const MP_BURST_GRID_5 =
  "grid grid-cols-5 gap-3 items-center flex-grow min-w-0"
