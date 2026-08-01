/**
 * Shared scrollport for all five channel pacing tables.
 * Measured chrome on /pacing/* is ~36rem at typical desktop densities; using one
 * constant stops the 220 vs 260 offset drift that nested the social scrollbar.
 */
export const PACING_TABLE_MAX_HEIGHT_CLASS = "max-h-[calc(100dvh-36rem)]"

export const PACING_TABLE_SCROLL_CLASSNAME = `relative ${PACING_TABLE_MAX_HEIGHT_CLASS} overflow-auto`
