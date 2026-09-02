/**
 * Persist a corrected column mapping onto a publisher_profiles row.
 * Writes Postgres when available; otherwise mutates the in-memory/seed
 * store used by tests and local fallback. A chat answer never silently
 * deletes: callers must pass an explicit mappedTo null for remove, and
 * the header must exist on the sheet under review.
 */

import {
  parsePublisherProfile,
  type PublisherProfileConfig,
} from "@/lib/mediaplans/ingest/publisherProfileConfig"
import { loadSeedPublisherProfiles } from "@/lib/mediaplans/ingest/loadPublisherProfiles"
import type { IngestReviewPackage } from "@/lib/mediaplans/ingest/buildIngestReview"

/** Process-local overlay so remaps stick across requests when DB is unavailable. */
const seedOverlay = new Map<string, PublisherProfileConfig>()

export type RemapSource = "ava_card" | "hub_remap" | "admin"

export type RemapRejection = {
  ok: false
  reason: string
  knownHeaders: string[]
}

export type RemapResult = {
  ok: true
  profile: PublisherProfileConfig
  source: "postgres" | "seed"
}

export type PublisherProfileAuditSeedRow = {
  action: "map" | "remap" | "remove"
  field: "column_map"
  header: string
  previous_value: string | null
  next_value: string | null
  changed_by: string
  source: RemapSource
  stage_id: string | null
  publisher_name: string
}

const seedAuditLog: PublisherProfileAuditSeedRow[] = []

export function clearPublisherProfileSeedOverlayForTests() {
  seedOverlay.clear()
  seedAuditLog.length = 0
}

export function getPublisherProfileSeedOverlay(): Map<
  string,
  PublisherProfileConfig
> {
  return seedOverlay
}

export function getPublisherProfileSeedAuditForTests(): PublisherProfileAuditSeedRow[] {
  return seedAuditLog
}

export function registerPublisherProfileOverlay(
  profile: PublisherProfileConfig,
) {
  seedOverlay.set(keyOf(profile.publisher_name), profile)
}

/** Profiles created in-process that are not in the seed/DB list. */
export function extraOverlayProfiles(
  existingNames: Iterable<string>,
): PublisherProfileConfig[] {
  const have = new Set([...existingNames].map((n) => keyOf(n)))
  const extras: PublisherProfileConfig[] = []
  for (const p of seedOverlay.values()) {
    if (!have.has(keyOf(p.publisher_name))) extras.push(p)
  }
  return extras
}

function keyOf(name: string): string {
  return name.trim().toLowerCase()
}

export function headerKeyOf(header: string): string {
  return header.replace(/\s+/g, " ").trim().toLowerCase()
}

export function validateRemapHeader(
  header: string,
  knownHeaders: string[],
): { ok: true; header: string } | { ok: false; reason: string } {
  const want = headerKeyOf(header)
  if (!want) {
    return { ok: false, reason: `"${header}" is not a column in this schedule.` }
  }
  const hit = knownHeaders.find((h) => headerKeyOf(h) === want)
  if (!hit) {
    return { ok: false, reason: `"${header}" is not a column in this schedule.` }
  }
  return { ok: true, header: hit }
}

export function applyColumnRemap(
  profile: PublisherProfileConfig,
  header: string,
  mappedTo: string | null,
): PublisherProfileConfig {
  const nextMap = { ...profile.column_map }
  const headerKey = Object.keys(nextMap).find(
    (k) => headerKeyOf(k) === headerKeyOf(header),
  )
  if (mappedTo == null || mappedTo === "" || mappedTo === "__unmap__") {
    if (headerKey) delete nextMap[headerKey]
  } else {
    const storeKey = headerKey ?? header
    nextMap[storeKey] = mappedTo
  }
  return parsePublisherProfile({
    ...profile,
    column_map: nextMap,
  })
}

function previousMappedTo(
  profile: PublisherProfileConfig,
  header: string,
): string | null {
  const headerKey = Object.keys(profile.column_map).find(
    (k) => headerKeyOf(k) === headerKeyOf(header),
  )
  if (!headerKey) return null
  return profile.column_map[headerKey] ?? null
}

export function auditActionForRemap(args: {
  previousValue: string | null
  nextValue: string | null
}): "map" | "remap" | "remove" {
  if (args.nextValue == null) return "remove"
  if (args.previousValue == null) return "map"
  return "remap"
}

/** In-memory Hub remap patch — chat uses the same function, never a fork. */
export function applyReviewColumnRemap(
  review: IngestReviewPackage,
  header: string,
  mappedTo: string | null,
): IngestReviewPackage {
  const want = headerKeyOf(header)
  const mark = (
    f: NonNullable<typeof review.template_coverage>["required"][number],
  ) => {
    if (f.matched || mappedTo == null) return f
    if (f.canonicals?.includes(mappedTo) || f.dest === mappedTo) {
      return {
        ...f,
        matched: true,
        source: { kind: "header" as const, header },
      }
    }
    return f
  }
  const required = review.template_coverage?.required.map(mark)
  const enrich = review.template_coverage?.enrich.map(mark)
  const profile = review.profile
    ? applyColumnRemap(review.profile, header, mappedTo)
    : review.profile
  return {
    ...review,
    profile,
    column_mapping: review.column_mapping.map((c) =>
      headerKeyOf(c.header) === want
        ? {
            header: c.header,
            mapped_to: mappedTo,
            unmapped: mappedTo == null,
            sheetName: c.sheetName,
          }
        : c,
    ),
    ava_mapping_proposals: (review.ava_mapping_proposals ?? []).filter(
      (p) => headerKeyOf(p.header) !== want,
    ),
    template_coverage: review.template_coverage
      ? {
          ...review.template_coverage,
          required: required ?? review.template_coverage.required,
          enrich: enrich ?? review.template_coverage.enrich,
          required_matched: (required ?? review.template_coverage.required).filter(
            (f) => f.matched,
          ).length,
          not_used: review.template_coverage.not_used.filter(
            (n) => headerKeyOf(n.header) !== want,
          ),
        }
      : review.template_coverage,
  }
}

export function knownHeadersFromReview(review: IngestReviewPackage): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  const push = (header: string) => {
    const key = headerKeyOf(header)
    if (!key || seen.has(key)) return
    seen.add(key)
    out.push(header)
  }
  for (const c of review.column_mapping) push(c.header)
  for (const n of review.template_coverage?.not_used ?? []) push(n.header)
  for (const header of review.ignored.columns_unmapped) push(header)
  for (const p of review.ava_mapping_proposals ?? []) push(p.header)
  return out
}

function reject(
  reason: string,
  knownHeaders: string[],
): RemapRejection {
  return { ok: false, reason, knownHeaders }
}

function recordSeedAudit(row: PublisherProfileAuditSeedRow) {
  seedAuditLog.push(row)
  console.info("[publisher-profile-audit]", row)
}

export async function persistColumnRemap(args: {
  publisherName: string
  header: string
  mappedTo: string | null
  knownHeaders: string[]
  changedBy: string
  source: RemapSource
  stageId?: string | null
}): Promise<RemapResult | RemapRejection> {
  const { publisherName, mappedTo, source } = args
  const knownHeaders = args.knownHeaders ?? []
  const changedBy = args.changedBy?.trim()
  if (!changedBy) {
    throw new Error("persistColumnRemap: changedBy is required (do not default)")
  }
  if (!Array.isArray(knownHeaders) || knownHeaders.length === 0) {
    return reject("knownHeaders is required and must be non-empty.", knownHeaders)
  }
  const validated = validateRemapHeader(args.header, knownHeaders)
  if (!validated.ok) {
    return reject(validated.reason, knownHeaders)
  }
  const header = validated.header
  const nextValue =
    mappedTo == null || mappedTo === "" || mappedTo === "__unmap__"
      ? null
      : mappedTo
  const stageId = args.stageId?.trim() || null

  let postgresWriteStarted = false
  try {
    const { db } = await import("@/db")
    const { publisherProfiles, publisherProfileChanges } = await import(
      "@/db/schema/publisherProfiles"
    )
    const { eq, sql } = await import("drizzle-orm")
    const rows = await db
      .select()
      .from(publisherProfiles)
      .where(eq(publisherProfiles.publisherName, publisherName))
      .limit(1)
    if (rows[0]) {
      const current = parsePublisherProfile({
        publisher_name: rows[0].publisherName,
        publisher_id: rows[0].publisherId ?? null,
        media_type: rows[0].mediaType,
        active: rows[0].active,
        detect_signature: rows[0].detectSignature,
        grouping_keys: (
          rows[0].detectSignature as { grouping_keys?: string[] }
        )?.grouping_keys,
        line_granularity: rows[0].lineGranularity,
        column_map: rows[0].columnMap,
        grid_semantics: rows[0].gridSemantics,
        legend_map: rows[0].legendMap,
        sheet_rules: rows[0].sheetRules,
        notes: rows[0].notes,
      })
      const previousValue = previousMappedTo(current, header)
      const action = auditActionForRemap({ previousValue, nextValue })
      const updated = applyColumnRemap(current, header, nextValue)
      postgresWriteStarted = true
      await db.transaction(async (tx) => {
        await tx
          .update(publisherProfiles)
          .set({
            columnMap: updated.column_map,
            updatedAt: sql`now()`,
            updatedBy: changedBy,
          })
          .where(eq(publisherProfiles.publisherName, publisherName))
        await tx.insert(publisherProfileChanges).values({
          publisherProfileId: rows[0].id,
          publisherName: rows[0].publisherName,
          field: "column_map",
          header,
          previousValue,
          nextValue,
          action,
          changedBy,
          source,
          stageId,
        })
      })
      seedOverlay.set(keyOf(publisherName), updated)
      return { ok: true, profile: updated, source: "postgres" }
    }
  } catch (err) {
    if (postgresWriteStarted) throw err
    // fall through to seed overlay
  }

  const base =
    seedOverlay.get(keyOf(publisherName)) ??
    loadSeedPublisherProfiles().find(
      (p) => keyOf(p.publisher_name) === keyOf(publisherName),
    )
  if (!base) {
    throw new Error(`Unknown publisher profile: ${publisherName}`)
  }
  const previousValue = previousMappedTo(base, header)
  const action = auditActionForRemap({ previousValue, nextValue })
  const updated = applyColumnRemap(base, header, nextValue)
  seedOverlay.set(keyOf(publisherName), updated)
  recordSeedAudit({
    action,
    field: "column_map",
    header,
    previous_value: previousValue,
    next_value: nextValue,
    changed_by: changedBy,
    source,
    stage_id: stageId,
    publisher_name: base.publisher_name,
  })
  return { ok: true, profile: updated, source: "seed" }
}

/** Profiles with seed overlay applied (for review after remap without DB). */
export function profilesWithRemapOverlay(
  profiles: PublisherProfileConfig[],
): PublisherProfileConfig[] {
  const mapped = profiles.map(
    (p) => seedOverlay.get(keyOf(p.publisher_name)) ?? p,
  )
  return [
    ...mapped,
    ...extraOverlayProfiles(mapped.map((p) => p.publisher_name)),
  ]
}
