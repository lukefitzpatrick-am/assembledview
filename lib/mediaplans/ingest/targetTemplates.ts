/**
 * AV plan templates per media type — the finite set of fields ingest must
 * find a source for. Data, not a DB table.
 */

import raw from "@/lib/mediaplans/ingest/seeds/targetTemplates.json"

export type TemplateFieldKind =
  | "profile"
  | "column"
  | "derived"
  | "money"
  | "grid"
  | "grid_count"

export type TemplateFieldDef = {
  id: string
  label: string
  dest: string
  kind: TemplateFieldKind
  canonicals?: string[]
  controlled?: { vocabulary: string }
}

export type SystemWaiverDef = {
  id: string
  default: string
  reason: string
}

export type DetailTableDef = {
  id: string
  label: string
  field_ids: string[]
}

export type TargetTemplate = {
  media_type: string
  required: TemplateFieldDef[]
  enrich: TemplateFieldDef[]
  system_waivers: SystemWaiverDef[]
  /** Editor-card fields in display order (Section A). */
  card_field_ids: string[]
  /** Collapsed detail-table row (OOH panels). Absent = no detail row. */
  detail_table?: DetailTableDef
  /** Folded under the media_money row, not standalone. */
  money_detail_ids?: string[]
}

const TEMPLATES = raw as Record<string, TargetTemplate>
const extraForTests = new Map<string, TargetTemplate>()

export function registerTargetTemplateForTests(
  template: TargetTemplate,
): () => void {
  const key = template.media_type.trim().toLowerCase()
  extraForTests.set(key, template)
  return () => {
    extraForTests.delete(key)
  }
}

export function getTargetTemplate(mediaType: string): TargetTemplate {
  const key = mediaType.trim().toLowerCase()
  const t = extraForTests.get(key) ?? TEMPLATES[key]
  if (!t) {
    throw new Error(`No ingest target template for media type "${mediaType}"`)
  }
  return t
}

export function listTargetTemplateMediaTypes(): string[] {
  return Object.keys(TEMPLATES)
}
