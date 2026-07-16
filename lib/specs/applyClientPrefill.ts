import type { MiResolvedSpec } from "./resolve"

export const MI_CLIENT_PREFILL_FIELDS = [
  // Social CLIENT
  "Image/Video File Name",
  "Primary Text",
  "Headline",
  "Description",
  "Call To Action",
  "Landing Page URL",
  "Preview Link",
  // Search CLIENT (must match template_structure.json Search.CLIENT)
  "Final URL",
  "Display Path 1",
  "Display Path 2",
  "Headlines (1-15)",
  "Descriptions (1-4)",
  "Sitelinks",
  "Callouts",
] as const

export type MiClientPrefillField = (typeof MI_CLIENT_PREFILL_FIELDS)[number]

export type MiClientPrefill = {
  line_item_id: string
  variant?: string
  fields: Partial<Record<MiClientPrefillField, string>>
}

function cloneRow(row: MiResolvedSpec): MiResolvedSpec {
  return {
    ...row,
    fields_am: { ...row.fields_am },
    fields_specs: { ...row.fields_specs },
    fields_client: { ...row.fields_client },
  }
}

function scrubFields(
  fields: Partial<Record<MiClientPrefillField, string>>,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const key of MI_CLIENT_PREFILL_FIELDS) {
    const value = fields[key]
    if (typeof value === "string" && value.trim()) {
      out[key] = value.trim()
    }
  }
  return out
}

/**
 * Merge client-side AVA copy selections into resolved MI rows.
 * First prefill for a line item updates that row; further prefills clone the
 * base row with a Variant label (A/B/C…) so the Social tab can hold multiples.
 */
export function applyClientPrefill(
  lineItems: MiResolvedSpec[],
  prefills: MiClientPrefill[],
): MiResolvedSpec[] {
  if (!prefills.length) return lineItems.map(cloneRow)

  const clones = lineItems.map(cloneRow)
  const insertAfter = new Map<number, MiResolvedSpec[]>()
  const hitCount = new Map<string, number>()

  for (const prefill of prefills) {
    const lineId = String(prefill.line_item_id ?? "").trim()
    if (!lineId) continue

    const index = clones.findIndex((row) => row.line_item_id === lineId)
    if (index < 0) continue

    const n = hitCount.get(lineId) ?? 0
    hitCount.set(lineId, n + 1)
    const fields = scrubFields(prefill.fields)
    const variant =
      prefill.variant?.trim() ||
      (n === 0 ? undefined : String.fromCharCode(65 + n))

    if (n === 0) {
      clones[index].fields_client = {
        ...clones[index].fields_client,
        ...fields,
      }
      if (variant) clones[index].variant = variant
      continue
    }

    const base = cloneRow(lineItems[index])
    base.fields_client = { ...base.fields_client, ...fields }
    base.variant = variant ?? String.fromCharCode(65 + n)
    const list = insertAfter.get(index) ?? []
    list.push(base)
    insertAfter.set(index, list)
  }

  const out: MiResolvedSpec[] = []
  clones.forEach((row, i) => {
    out.push(row)
    out.push(...(insertAfter.get(i) ?? []))
  })
  return out
}
