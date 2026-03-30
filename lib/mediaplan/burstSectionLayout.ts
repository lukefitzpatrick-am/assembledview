/**
 * Shared burst table chrome for media plan line items (matches Search container design).
 * Keep field labels and form paths in each container; only layout classes live here.
 */

/** Outer wrapper: horizontal inset and vertical gap between burst header and cards. */
export const MP_BURST_SECTION_OUTER =
  "mx-2 flex flex-col gap-1 rounded-xl"

/** Burst index / date label column; width must match header spacer. */
export const MP_BURST_LABEL_COLUMN =
  "mp-burst-label-column w-24 flex-shrink-0 flex items-end justify-start text-left"

/** Actions column: left-aligned with Add. */
export const MP_BURST_ACTION_COLUMN =
  "mp-burst-action-column w-[260px] shrink-0 flex items-center justify-start gap-1.5 flex-wrap"

export const MP_BURST_CARD =
  "mp-burst-card w-full border-0 shadow-none bg-transparent border-b border-border/30 last:border-b-0"

export const MP_BURST_CARD_CONTENT = "px-4 py-3"

export const MP_BURST_HEADER_SHELL =
  "w-full rounded-t-lg border-b border-border/50 bg-gradient-to-r from-muted/60 to-muted/30 sticky top-0 z-10 backdrop-blur-sm"

export const MP_BURST_HEADER_INNER = "flex items-end gap-3 px-4 py-1.5"

/** Header row that aligns burst labels with row fields/actions. */
export const MP_BURST_HEADER_ROW = "flex min-h-10 min-w-0 flex-1 items-center gap-3"

/** Standard burst row shell for label + input grid + actions. */
export const MP_BURST_ROW_SHELL =
  "flex items-center gap-3 hover:bg-muted/20 transition-colors duration-150 rounded-md"

/** Standard burst row label heading typography. */
export const MP_BURST_LABEL_HEADING =
  "m-0 text-xs font-semibold uppercase tracking-wider text-muted-foreground leading-tight"

/** Data + header grids with 7 logical columns (Budget, Buy, Start+End, calculated, Media, Fee). */
export const MP_BURST_GRID_7 =
  "grid grid-cols-7 gap-3 items-end flex-1 min-w-0"

/** Integration-style 5-column burst grid (Media/Fee wrap to row 2). */
export const MP_BURST_GRID_5 =
  "grid grid-cols-5 gap-4 items-end flex-1 min-w-0"
