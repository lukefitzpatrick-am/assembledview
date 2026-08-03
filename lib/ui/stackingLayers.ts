/**
 * Overlay stacking scale (MB-29).
 *
 * Tailwind utilities: `z-chrome` … `z-toast`, plus in-surface `z-eg-*`.
 * Values must stay in sync with `theme.extend.zIndex` in `tailwind.config.cjs`.
 *
 * Same-tier rule: any surface opened from inside another surface must declare
 * a higher layer (`layer="nested"` on DialogContent / billing wrappers). Never
 * rely on portal DOM order among peers at the same z-index — that is the
 * fragility MB-26 exposed (Select-over-Dialog worked by accident until Dialog
 * moved above z-50). Sheet and Dialog both default to modal; a Sheet-hosted
 * Dialog that stays at modal recreates the bug one level up.
 *
 * Popovers sit below toasts (80 < 100). That is intentional; re-pointing
 * Popover from the historical z-[200] is a behaviour change.
 */

export const STACKING_LAYERS = {
  chrome: 40,
  assistant: 50,
  modal: 60,
  nested: 70,
  popover: 80,
  tooltip: 90,
  toast: 100,
} as const

/** ExpertGrid in-surface tokens — table stacking context, not overlay. */
export const EG_SURFACE_LAYERS = {
  "eg-under": 1,
  "eg-ring-lo": 5,
  "eg-ring": 6,
  "eg-ring-hi": 7,
  "eg-sticky-week": 10,
  "eg-resize": 15,
  "eg-sticky": 20,
  "eg-cell-float": 30,
  "eg-hint": 35,
  "eg-cell-float-hi": 40,
} as const

export type OverlayStackingLayer = keyof typeof STACKING_LAYERS
export type DialogStackingLayer = "modal" | "nested"
