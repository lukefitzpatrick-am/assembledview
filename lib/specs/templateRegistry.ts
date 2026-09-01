/**
 * MI SPECS field roles. Lives outside vendored `mi-library/` (never edit those JSON files).
 *
 * required = fills-today: a SPECS column is REQUIRED iff the mapper writes it when the
 * library key exists. ENRICH is reserved for columns the mapper still cannot fill from
 * any current publisher JSON key (do not invent values).
 */
import { loadTemplateStructure } from "./library.js"

export type SpecsFieldRole = "REQUIRED" | "ENRICH"

/** Columns that still have no library key anywhere in mi-library — stay ENRICH. */
const ENRICH_EXCEPTIONS: Record<string, ReadonlySet<string>> = {
  Print: new Set(["Specs Link"]),
}

/**
 * Fields promoted ENRICH → REQUIRED in the mapping-hole pass (aliases, put() keys,
 * object joinScalar, duration_options, Civic catalogue). Listed for audit; the live
 * role is `specsFieldRole`.
 */
export const PROMOTED_ENRICH_TO_REQUIRED: Record<string, readonly string[]> = {
  Programmatic: ["Animation Rules", "Backup Image"],
  "Direct Digital": ["Animation Rules"],
  YouTube: ["Video Requirements", "Safe Zone", "Companion Banner"],
  BVOD: ["File Format", "Codec", "Video Bit Rate", "Audio Bit Rate", "Audio Levels", "Frame Rate", "File Size Max"],
  Audio: ["File Format", "Bit Rate", "Creative Length", "Specs Notes"],
  OOH: ["Creative Type (Static/Animated)", "DPI / Bit Rate", "Creative Duration"],
  Print: ["Physical Dimensions", "Paper Weight / Stock", "Delivery Notes"],
  Cinema: ["File Format", "Codec", "Frame Rate", "Audio Specs"],
  Television: ["File Format", "Audio Levels", "Length", "Cleared Material"],
}

export function specsFieldRole(tab: string, column: string): SpecsFieldRole {
  if (ENRICH_EXCEPTIONS[tab]?.has(column)) return "ENRICH"
  return "REQUIRED"
}

export function specsRolesForTab(tab: string): Record<string, SpecsFieldRole> {
  const columns = loadTemplateStructure().tabs[tab]?.SPECS ?? []
  return Object.fromEntries(columns.map((column) => [column, specsFieldRole(tab, column)]))
}
