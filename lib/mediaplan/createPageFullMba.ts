/**
 * Partial MBAs are edit-only (Luke, 2 Nov 2026). The create page builds no
 * partial selection: every save from create sends a full MBA scope and no
 * partial approval metadata. The partial MBA is chosen on edit after the first
 * save, where line ids are stable.
 */
import type { MbaScopeBody } from "@/lib/mediaplan/mbaScopeForSave"

/** Shown where the partial MBA control was on create. */
export const PARTIAL_MBA_AFTER_SAVE_NOTE = "Save the plan, then choose a partial MBA."

/** The `mbaScope` every create save sends: full scope (all lines, all months). */
export const CREATE_PAGE_FULL_MBA_SCOPE: MbaScopeBody = Object.freeze({
  lineItemIds: null,
  monthYears: null,
}) as MbaScopeBody
