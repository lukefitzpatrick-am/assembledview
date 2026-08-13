/**
 * Template-first completeness: each AV template field either has a source
 * or it doesn't. Leftover publisher columns are not debt.
 */

import type { DetectedSheetShape } from "@/lib/mediaplans/ingest/detectShape"
import type { IngestProposal } from "@/lib/mediaplans/ingest/proposeLineItems"
import {
  isReferenceIgnoreTarget,
  type PublisherProfileConfig,
} from "@/lib/mediaplans/ingest/publisherProfileConfig"
import {
  getTargetTemplate,
  type TemplateFieldDef,
} from "@/lib/mediaplans/ingest/targetTemplates"

export type CoverageSourceKind =
  | "header"
  | "grouping_rows"
  | "profile"
  | "derived"
  | "grid"
  | "waiver"
  | "unmatched"

export type CoverageSource = {
  kind: CoverageSourceKind
  header?: string
  sample?: string
}

export type TemplateFieldCoverage = {
  id: string
  label: string
  role: "required" | "enrich"
  matched: boolean
  dest: string
  source: CoverageSource
  confidence: number
  canonicals?: string[]
}

export type CoverageWaiver = {
  fieldId: string
  defaultValue: string
  by: string
  reason: string
}

export type NotUsedColumn = {
  header: string
  sample?: string
}

export type TemplateCoverage = {
  media_type: string
  required: TemplateFieldCoverage[]
  enrich: TemplateFieldCoverage[]
  not_used: NotUsedColumn[]
  required_matched: number
  required_count: number
  completeness: number
  grid: {
    resolved: number
    total: number
    unresolved_headers: string[]
  }
  warnings: string[]
  waivers: CoverageWaiver[]
}

function headerKey(h: string): string {
  return h.replace(/\s+/g, " ").trim().toLowerCase()
}

function reverseColumnMap(
  profile: PublisherProfileConfig,
): Map<string, string> {
  const out = new Map<string, string>()
  for (const [header, canon] of Object.entries(profile.column_map)) {
    if (!out.has(canon)) out.set(canon, header)
  }
  return out
}

function sampleForHeader(
  shape: DetectedSheetShape | null,
  header: string,
): string | undefined {
  if (!shape) return undefined
  const col = shape.descriptor_columns.find(
    (d) => headerKey(d.header) === headerKey(header),
  )
  if (!col) return undefined
  for (const r of shape.data_rows) {
    const v = (shape.matrix[r]?.[col.col] ?? "").trim()
    if (v) return v
  }
  return undefined
}

function groupingSample(
  proposal: IngestProposal | null,
  canonicals: string[],
): string | undefined {
  if (!proposal) return undefined
  for (const item of proposal.line_items) {
    for (const c of canonicals) {
      const v = item.grouping[c]?.trim()
      if (v) return v
    }
  }
  return undefined
}

function evaluateField(
  field: TemplateFieldDef,
  role: "required" | "enrich",
  args: {
    profile: PublisherProfileConfig | null
    shape: DetectedSheetShape | null
    proposal: IngestProposal | null
    reverse: Map<string, string>
  },
): TemplateFieldCoverage {
  const canonicals = field.canonicals ?? []
  const base = {
    id: field.id,
    label: field.label,
    role,
    dest: field.dest,
    canonicals: canonicals.length > 0 ? canonicals : undefined,
  }

  const unmatched = (): TemplateFieldCoverage => ({
    ...base,
    matched: false,
    source: { kind: "unmatched" },
    confidence: 0,
  })

  if (field.kind === "profile") {
    if (args.profile?.publisher_name) {
      return {
        ...base,
        matched: true,
        source: {
          kind: "profile",
          sample: args.profile.publisher_name,
        },
        confidence: 1,
      }
    }
    return unmatched()
  }

  if (field.kind === "derived") {
    if (args.proposal) {
      return {
        ...base,
        matched: true,
        source: { kind: "derived", sample: "from panel count" },
        confidence: 1,
      }
    }
    return unmatched()
  }

  if (field.kind === "grid") {
    const cols = args.shape?.grid_columns ?? []
    const resolved = cols.filter((g) => Boolean(g.start_date)).length
    const burstsHaveDates = (args.proposal?.line_items ?? []).some((li) =>
      li.bursts.some((b) => Boolean(b.start_date)),
    )
    if (resolved > 0 || burstsHaveDates) {
      return {
        ...base,
        matched: true,
        source: {
          kind: "grid",
          sample:
            cols.find((g) => g.start_date)?.start_date ??
            args.proposal?.line_items[0]?.bursts[0]?.start_date ??
            undefined,
        },
        confidence: cols.length > 0 ? resolved / cols.length : 1,
      }
    }
    return unmatched()
  }

  if (field.kind === "grid_count") {
    const semantics = args.profile?.grid_semantics
    const hasQty = (args.proposal?.line_items ?? []).some((li) =>
      li.bursts.some((b) => b.quantity > 0),
    )
    if (semantics === "count" && hasQty) {
      return {
        ...base,
        matched: true,
        source: { kind: "grid", sample: "spot counts" },
        confidence: 1,
      }
    }
    return unmatched()
  }

  // column + money: header first, then grouping rows
  for (const canon of canonicals) {
    const header = args.reverse.get(canon)
    if (header) {
      return {
        ...base,
        matched: true,
        source: {
          kind: "header",
          header,
          sample: sampleForHeader(args.shape, header),
        },
        confidence: 1,
      }
    }
  }

  const groupingHit = canonicals.some((c) =>
    (args.profile?.grouping_keys ?? []).includes(c),
  )
  if (groupingHit) {
    return {
      ...base,
      matched: true,
      source: {
        kind: "grouping_rows",
        sample: groupingSample(args.proposal, canonicals),
      },
      confidence: 1,
    }
  }

  return unmatched()
}

function usedHeaders(coverage: TemplateFieldCoverage[]): Set<string> {
  const out = new Set<string>()
  for (const f of coverage) {
    if (f.source.kind === "header" && f.source.header) {
      out.add(headerKey(f.source.header))
    }
  }
  return out
}

export function evaluateTemplateCoverage(args: {
  mediaType: string
  profile: PublisherProfileConfig | null
  shape: DetectedSheetShape | null
  proposal: IngestProposal | null
}): TemplateCoverage {
  const template = getTargetTemplate(args.mediaType)
  const reverse = args.profile
    ? reverseColumnMap(args.profile)
    : new Map<string, string>()
  const ctx = {
    profile: args.profile,
    shape: args.shape,
    proposal: args.proposal,
    reverse,
  }

  const required = template.required.map((f) =>
    evaluateField(f, "required", ctx),
  )
  const enrich = template.enrich.map((f) => evaluateField(f, "enrich", ctx))

  const gridCols = args.shape?.grid_columns ?? []
  const gridResolved = gridCols.filter((g) => Boolean(g.start_date)).length
  const grid = {
    resolved: gridResolved,
    total: gridCols.length,
    unresolved_headers: gridCols
      .filter((g) => !g.start_date)
      .map((g) => g.header),
  }

  const required_matched = required.filter((f) => f.matched).length
  const required_count = required.length
  const requiredRatio =
    required_count > 0 ? required_matched / required_count : 1
  const gridRatio = grid.total > 0 ? grid.resolved / grid.total : 1
  const completeness = requiredRatio * 0.8 + gridRatio * 0.2

  const mappedKeys = new Set(
    Object.keys(args.profile?.column_map ?? {}).map(headerKey),
  )
  const claimed = usedHeaders([...required, ...enrich])
  const not_used: NotUsedColumn[] = []
  if (args.shape) {
    const seen = new Set<string>()
    for (const d of args.shape.descriptor_columns) {
      const key = headerKey(d.header)
      if (!key || seen.has(key)) continue
      seen.add(key)
      const mappedTo = args.profile
        ? Object.entries(args.profile.column_map).find(
            ([h]) => headerKey(h) === key,
          )?.[1]
        : undefined
      if (mappedTo && isReferenceIgnoreTarget(mappedTo)) continue
      if (mappedKeys.has(key) && claimed.has(key)) continue
      if (mappedTo && claimed.has(headerKey(mappedTo))) continue
      if (
        mappedTo &&
        [...required, ...enrich].some(
          (f) => f.source.header && headerKey(f.source.header) === key,
        )
      ) {
        continue
      }
      if (
        mappedTo &&
        (required.some((f) => f.canonicals?.includes(mappedTo)) ||
          enrich.some((f) => f.canonicals?.includes(mappedTo)))
      ) {
        continue
      }
      not_used.push({
        header: d.header,
        sample: sampleForHeader(args.shape, d.header),
      })
    }
  }

  const waivers: CoverageWaiver[] = template.system_waivers.map((w) => ({
    fieldId: w.id,
    defaultValue: w.default,
    by: "system",
    reason: w.reason,
  }))
  const waived = new Set(waivers.map((w) => w.fieldId))
  const applyWaiver = (list: TemplateFieldCoverage[]) => {
    for (const f of list) {
      if (f.matched || !waived.has(f.id)) continue
      const w = waivers.find((x) => x.fieldId === f.id)
      if (!w) continue
      f.matched = true
      f.source = { kind: "waiver", sample: w.defaultValue || "system default" }
      f.confidence = 1
    }
  }
  applyWaiver(required)
  applyWaiver(enrich)

  const warnings: string[] = []
  const site = enrich.find((f) => f.id === "site_number")
  const panelName = enrich.find((f) => f.id === "panel_name")
  const hasPanels = (args.proposal?.line_items ?? []).some(
    (li) => li.panels.length > 0,
  )
  if (
    args.mediaType.toLowerCase() === "ooh" &&
    hasPanels &&
    !site?.matched &&
    !panelName?.matched
  ) {
    warnings.push("panel lines will be anonymous")
  }

  return {
    media_type: template.media_type,
    required,
    enrich,
    not_used,
    required_matched,
    required_count,
    completeness,
    grid,
    warnings,
    waivers,
  }
}

export function evaluateRequiredFieldGate(coverage: {
  required: Array<{ id: string; label: string; matched: boolean }>
  waivers: CoverageWaiver[]
}): { ok: boolean; missing: string[]; reason: string | null } {
  const waived = new Set(coverage.waivers.map((w) => w.fieldId))
  const missing = coverage.required
    .filter((f) => !f.matched && !waived.has(f.id))
    .map((f) => f.label)
  if (missing.length === 0) {
    return { ok: true, missing: [], reason: null }
  }
  return {
    ok: false,
    missing,
    reason: `Required field unmatched: ${missing.join(", ")}`,
  }
}
