/**
 * Project template coverage onto the media type's editor card (MR-12).
 * Section A rows = card fields + optional collapsed detail table.
 * Panel descriptors / charges / lunar never get their own rows.
 */

import {
  getTargetTemplate,
  type TargetTemplate,
} from "@/lib/mediaplans/ingest/targetTemplates"
import type {
  TemplateCoverage,
  TemplateFieldCoverage,
} from "@/lib/mediaplans/ingest/templateCoverage"

export type ReviewCardFieldRow = {
  kind: "field"
  id: string
  label: string
  field: TemplateFieldCoverage
  details: TemplateFieldCoverage[]
}

export type ReviewCardDetailRow = {
  kind: "detail_table"
  id: string
  label: string
  summary: string
  matched: number
  total: number
  fields: TemplateFieldCoverage[]
  warning?: string
}

export type ReviewCardRow = ReviewCardFieldRow | ReviewCardDetailRow

export type ReviewCardSurface = {
  media_type: string
  rows: ReviewCardRow[]
}

function allFields(coverage: TemplateCoverage): TemplateFieldCoverage[] {
  return [...coverage.required, ...coverage.enrich]
}

function lookupField(
  coverage: TemplateCoverage,
  id: string,
): TemplateFieldCoverage | undefined {
  return allFields(coverage).find((f) => f.id === id)
}

function fieldFromWaiver(
  template: TargetTemplate,
  coverage: TemplateCoverage,
  id: string,
): TemplateFieldCoverage | undefined {
  const w = coverage.waivers.find((x) => x.fieldId === id)
  if (!w) return undefined
  const def =
    template.required.find((f) => f.id === id) ??
    template.enrich.find((f) => f.id === id)
  return {
    id,
    label: def?.label ?? id,
    role: "enrich",
    matched: true,
    dest: def?.dest ?? "",
    source: { kind: "waiver", sample: w.defaultValue || "system default" },
    confidence: 1,
    canonicals: def?.canonicals,
  }
}

function resolveCardField(
  template: TargetTemplate,
  coverage: TemplateCoverage,
  id: string,
): TemplateFieldCoverage | undefined {
  return lookupField(coverage, id) ?? fieldFromWaiver(template, coverage, id)
}

export function buildReviewCardSurface(
  coverage: TemplateCoverage,
): ReviewCardSurface {
  const template = getTargetTemplate(coverage.media_type)
  const rows: ReviewCardRow[] = []
  const moneyDetailIds = new Set(template.money_detail_ids ?? [])

  for (const id of template.card_field_ids) {
    const field = resolveCardField(template, coverage, id)
    if (!field) continue
    const details =
      id === "media_money"
        ? (template.money_detail_ids ?? [])
            .map((did) => lookupField(coverage, did))
            .filter((f): f is TemplateFieldCoverage => Boolean(f))
        : []
    rows.push({
      kind: "field",
      id: field.id,
      label: field.label,
      field,
      details,
    })
  }

  if (template.detail_table) {
    const fields = template.detail_table.field_ids
      .filter((id) => !moneyDetailIds.has(id))
      .map((id) => lookupField(coverage, id))
      .filter((f): f is TemplateFieldCoverage => Boolean(f))
    const matched = fields.filter((f) => f.matched).length
    const total = fields.length
    const warning = coverage.warnings.find((w) =>
      /panel lines will be anonymous/i.test(w),
    )
    rows.push({
      kind: "detail_table",
      id: template.detail_table.id,
      label: template.detail_table.label,
      summary: `${template.detail_table.label} — ${matched} of ${total} matched`,
      matched,
      total,
      fields,
      warning,
    })
  }

  return { media_type: template.media_type, rows }
}
