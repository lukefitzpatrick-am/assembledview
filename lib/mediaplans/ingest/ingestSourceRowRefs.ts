/**
 * Ingest row identity that can ride load → form → save.
 * Never put FORM_STAMP_MBA ids in line_item_id — assignStableLineItemNumbers
 * would parse them as channel ordinals and collide with existing lines.
 */

export const INGEST_SOURCE_ROW_REFS_ATTR = "ingest_source_row_refs"

export type SavedLineForIngestPanels = {
  lineItemId: string
  channel: string
  ingestSourceRowRefs?: readonly string[] | null
  attrs?: Record<string, unknown> | null
}

export function uniqueTrimmedRefs(values: readonly unknown[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const value of values) {
    if (typeof value !== "string") continue
    const trimmed = value.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    out.push(trimmed)
  }
  return out
}

function asRefArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  const refs = uniqueTrimmedRefs(value)
  return refs.length > 0 ? refs : null
}

function refsFromPanelList(panels: unknown): string[] {
  if (!Array.isArray(panels)) return []
  return uniqueTrimmedRefs(
    panels.map((panel) => {
      if (!panel || typeof panel !== "object") return null
      const rec = panel as Record<string, unknown>
      return rec.sourceRowRef ?? rec.source_row_ref
    }),
  )
}

export function ingestSourceRowRefsFromAttrs(
  attrs: Record<string, unknown> | null | undefined,
): string[] {
  if (!attrs) return []
  const stamped = asRefArray(attrs[INGEST_SOURCE_ROW_REFS_ATTR])
  if (stamped) return stamped
  const nested = attrs.attrs
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    const nestedStamped = asRefArray(
      (nested as Record<string, unknown>)[INGEST_SOURCE_ROW_REFS_ATTR],
    )
    if (nestedStamped) return nestedStamped
  }
  return refsFromPanelList(attrs.panels)
}

export function ingestSourceRowRefsFromFormSnapshot(
  raw: unknown,
): string[] {
  if (!raw || typeof raw !== "object") return []
  const rec = raw as Record<string, unknown>
  const nestedAttrs =
    rec.attrs && typeof rec.attrs === "object" && !Array.isArray(rec.attrs)
      ? (rec.attrs as Record<string, unknown>)
      : null
  const fromNested = ingestSourceRowRefsFromAttrs(nestedAttrs)
  if (fromNested.length > 0) return fromNested
  return ingestSourceRowRefsFromAttrs(rec)
}

export function ingestSourceRowRefsFromSavedLine(
  line: SavedLineForIngestPanels,
): string[] {
  const explicit = asRefArray(line.ingestSourceRowRefs ?? null)
  if (explicit) return explicit
  return ingestSourceRowRefsFromAttrs(line.attrs)
}
