/**
 * Server-only publisher_profiles column_map / field_defaults writers.
 * Never imported from Client Components.
 */
import "server-only"

import { eq, sql } from "drizzle-orm"
import { db } from "@/db"
import {
  publisherProfileChanges,
  publisherProfiles,
} from "@/db/schema/publisherProfiles"
import { loadSeedPublisherProfiles } from "@/lib/mediaplans/ingest/loadPublisherProfiles"
import {
  applyColumnRemap,
  applyFieldDefault,
  auditActionForRemap,
  getPublisherProfileSeedOverlay,
  keyOf,
  previousFieldDefault,
  previousMappedTo,
  recordPublisherProfileSeedAudits,
  rejectRemap,
  validateRemapHeader,
  type RemapRejection,
  type RemapResult,
  type RemapSource,
} from "@/lib/mediaplans/ingest/persistColumnRemap"
import { parsePublisherProfile } from "@/lib/mediaplans/ingest/publisherProfileConfig"

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
    return rejectRemap("knownHeaders is required and must be non-empty.", knownHeaders)
  }
  const validated = validateRemapHeader(args.header, knownHeaders)
  if (!validated.ok) {
    return rejectRemap(validated.reason, knownHeaders)
  }
  const header = validated.header
  const nextValue =
    mappedTo == null || mappedTo === "" || mappedTo === "__unmap__"
      ? null
      : mappedTo
  const stageId = args.stageId?.trim() || null
  const seedOverlay = getPublisherProfileSeedOverlay()

  let postgresWriteStarted = false
  try {
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
        field_defaults: rows[0].fieldDefaults ?? {},
        money_rules: rows[0].moneyRules ?? {},
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
  recordPublisherProfileSeedAudits([
    {
      action,
      field: "column_map",
      header,
      previous_value: previousValue,
      next_value: nextValue,
      changed_by: changedBy,
      source,
      stage_id: stageId,
      publisher_name: base.publisher_name,
    },
  ])
  return { ok: true, profile: updated, source: "seed" }
}

export async function persistFieldDefault(args: {
  publisherName: string
  field: string
  value: string | null
  changedBy: string
  source: RemapSource
  stageId?: string | null
}): Promise<RemapResult | RemapRejection> {
  const { publisherName, source } = args
  const field = args.field.replace(/\s+/g, " ").trim()
  const changedBy = args.changedBy?.trim()
  if (!changedBy) {
    throw new Error("persistFieldDefault: changedBy is required (do not default)")
  }
  if (!field) {
    return rejectRemap("field is required.", [])
  }
  const nextValue =
    args.value == null || args.value === "" ? null : args.value.trim()
  const stageId = args.stageId?.trim() || null
  const seedOverlay = getPublisherProfileSeedOverlay()

  let postgresWriteStarted = false
  try {
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
        field_defaults: rows[0].fieldDefaults ?? {},
        money_rules: rows[0].moneyRules ?? {},
        grid_semantics: rows[0].gridSemantics,
        legend_map: rows[0].legendMap,
        sheet_rules: rows[0].sheetRules,
        notes: rows[0].notes,
      })
      const previousValue = previousFieldDefault(current, field)
      const action = auditActionForRemap({ previousValue, nextValue })
      const updated = applyFieldDefault(current, field, nextValue)
      postgresWriteStarted = true
      await db.transaction(async (tx) => {
        await tx
          .update(publisherProfiles)
          .set({
            fieldDefaults: updated.field_defaults,
            updatedAt: sql`now()`,
            updatedBy: changedBy,
          })
          .where(eq(publisherProfiles.publisherName, publisherName))
        await tx.insert(publisherProfileChanges).values({
          publisherProfileId: rows[0].id,
          publisherName: rows[0].publisherName,
          field: "field_defaults",
          header: field,
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
  const previousValue = previousFieldDefault(base, field)
  const action = auditActionForRemap({ previousValue, nextValue })
  const updated = applyFieldDefault(base, field, nextValue)
  seedOverlay.set(keyOf(publisherName), updated)
  recordPublisherProfileSeedAudits([
    {
      action,
      field: "field_defaults",
      header: field,
      previous_value: previousValue,
      next_value: nextValue,
      changed_by: changedBy,
      source,
      stage_id: stageId,
      publisher_name: base.publisher_name,
    },
  ])
  return { ok: true, profile: updated, source: "seed" }
}
