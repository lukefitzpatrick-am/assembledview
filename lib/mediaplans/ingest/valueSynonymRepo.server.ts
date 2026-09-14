/**
 * Server-only publisher value-synonym store (0060).
 * Never imported from Client Components.
 */
import "server-only"

import { and, eq, isNull, or, sql } from "drizzle-orm"
import { db } from "@/db"
import { publisherValueSynonyms } from "@/db/schema/publisherValueSynonyms"
import {
  learnSynonymOnOverlay,
  listSynonymsFromOverlay,
  retireOverlaySynonym,
  scopeOf,
  upsertOverlay,
  type ValueSynonymRow,
} from "@/lib/mediaplans/ingest/valueSynonymRepo"

function rowFromDb(row: {
  id: number
  publisherId: number | null
  mediaType: string
  vocabulary: string
  avField: string
  rawValue: string
  rawValueDisplay: string
  avCanonical: string
  learnedFromStageId: string | null
  createdBy: string
  isActive: boolean
  retiredAt: string | null
  retiredBy: string | null
}): ValueSynonymRow {
  return {
    id: row.id,
    publisherId: row.publisherId ?? null,
    scope: scopeOf(row.publisherId ?? null),
    mediaType: row.mediaType,
    vocabulary: row.vocabulary,
    avField: row.avField,
    rawValue: row.rawValue,
    rawValueDisplay: row.rawValueDisplay,
    avCanonical: row.avCanonical,
    learnedFromStageId: row.learnedFromStageId ?? null,
    createdBy: row.createdBy,
    isActive: row.isActive,
    retiredAt: row.retiredAt ?? null,
    retiredBy: row.retiredBy ?? null,
  }
}

export async function listSynonymsFor(args: {
  vocabulary: string
  publisherId: number | null
}): Promise<ValueSynonymRow[]> {
  try {
    const publisherClause =
      args.publisherId == null
        ? isNull(publisherValueSynonyms.publisherId)
        : or(
            isNull(publisherValueSynonyms.publisherId),
            eq(publisherValueSynonyms.publisherId, args.publisherId),
          )
    const rows = await db
      .select()
      .from(publisherValueSynonyms)
      .where(
        and(
          eq(publisherValueSynonyms.vocabulary, args.vocabulary),
          eq(publisherValueSynonyms.isActive, true),
          publisherClause,
        ),
      )
    const overlay = listSynonymsFromOverlay(args)
    if (rows.length > 0 || overlay.length === 0) {
      return rows.map((row) =>
        rowFromDb({
          id: row.id,
          publisherId: row.publisherId ?? null,
          mediaType: row.mediaType,
          vocabulary: row.vocabulary,
          avField: row.avField,
          rawValue: row.rawValue,
          rawValueDisplay: row.rawValueDisplay,
          avCanonical: row.avCanonical,
          learnedFromStageId: row.learnedFromStageId ?? null,
          createdBy: row.createdBy,
          isActive: row.isActive,
          retiredAt: row.retiredAt ?? null,
          retiredBy: row.retiredBy ?? null,
        }),
      )
    }
  } catch {
    // table missing / no DATABASE_URL — overlay
  }
  return listSynonymsFromOverlay(args)
}

export async function retireSynonym(args: {
  id: number
  retiredBy: string
}): Promise<void> {
  const retiredBy = args.retiredBy.trim()
  if (!retiredBy) {
    throw new Error("retireSynonym: retiredBy is required (do not default)")
  }
  let postgresWriteStarted = false
  try {
    postgresWriteStarted = true
    await db
      .update(publisherValueSynonyms)
      .set({
        isActive: false,
        retiredAt: sql`now()`,
        retiredBy,
      })
      .where(eq(publisherValueSynonyms.id, args.id))
  } catch (err) {
    if (postgresWriteStarted) throw err
  }
  retireOverlaySynonym(args.id, retiredBy)
}

export async function learnSynonym(args: {
  publisherId: number | null
  mediaType: string
  vocabulary: string
  avField: string
  rawValue: string
  rawValueDisplay: string
  avCanonical: string
  learnedFromStageId?: string | null
  createdBy: string
}): Promise<ValueSynonymRow> {
  const createdBy = args.createdBy.trim()
  if (!createdBy) {
    throw new Error("learnSynonym: createdBy is required (do not default)")
  }
  const rawValue = args.rawValue.replace(/\s+/g, " ").trim().toLowerCase()
  const rawValueDisplay = args.rawValueDisplay.trim() || args.rawValue.trim()
  const avCanonical = args.avCanonical.trim()
  const learnedFromStageId = args.learnedFromStageId?.trim() || null
  const publisherId = args.publisherId

  let postgresWriteStarted = false
  try {
    const publisherMatch =
      publisherId == null
        ? isNull(publisherValueSynonyms.publisherId)
        : eq(publisherValueSynonyms.publisherId, publisherId)
    const existing = await db
      .select()
      .from(publisherValueSynonyms)
      .where(
        and(
          publisherMatch,
          eq(publisherValueSynonyms.vocabulary, args.vocabulary),
          eq(publisherValueSynonyms.rawValue, rawValue),
          eq(publisherValueSynonyms.isActive, true),
        ),
      )
      .limit(1)
    const current = existing[0]
    if (current && current.avCanonical === avCanonical) {
      return rowFromDb({
        id: current.id,
        publisherId: current.publisherId ?? null,
        mediaType: current.mediaType,
        vocabulary: current.vocabulary,
        avField: current.avField,
        rawValue: current.rawValue,
        rawValueDisplay: current.rawValueDisplay,
        avCanonical: current.avCanonical,
        learnedFromStageId: current.learnedFromStageId ?? null,
        createdBy: current.createdBy,
        isActive: current.isActive,
        retiredAt: current.retiredAt ?? null,
        retiredBy: current.retiredBy ?? null,
      })
    }
    postgresWriteStarted = true
    if (current) {
      await db
        .update(publisherValueSynonyms)
        .set({
          isActive: false,
          retiredAt: sql`now()`,
          retiredBy: createdBy,
        })
        .where(eq(publisherValueSynonyms.id, current.id))
    }
    const inserted = await db
      .insert(publisherValueSynonyms)
      .values({
        publisherId,
        mediaType: args.mediaType,
        vocabulary: args.vocabulary,
        avField: args.avField,
        rawValue,
        rawValueDisplay,
        avCanonical,
        learnedFromStageId,
        createdBy,
        isActive: true,
      })
      .returning()
    const row = inserted[0]!
    const mapped = rowFromDb({
      id: row.id,
      publisherId: row.publisherId ?? null,
      mediaType: row.mediaType,
      vocabulary: row.vocabulary,
      avField: row.avField,
      rawValue: row.rawValue,
      rawValueDisplay: row.rawValueDisplay,
      avCanonical: row.avCanonical,
      learnedFromStageId: row.learnedFromStageId ?? null,
      createdBy: row.createdBy,
      isActive: row.isActive,
      retiredAt: row.retiredAt ?? null,
      retiredBy: row.retiredBy ?? null,
    })
    upsertOverlay(mapped)
    return mapped
  } catch (err) {
    if (postgresWriteStarted) throw err
  }

  return learnSynonymOnOverlay({
    publisherId,
    mediaType: args.mediaType,
    vocabulary: args.vocabulary,
    avField: args.avField,
    rawValue,
    rawValueDisplay,
    avCanonical,
    learnedFromStageId,
    createdBy,
  })
}
