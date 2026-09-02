/**
 * Server-side publisher value-synonym store (0060). Never import from a
 * Client Component. Postgres when the table exists; otherwise an in-memory
 * overlay so tests and local ingest still learn. Mirror persistColumnRemap:
 * if a write has started, fail loud — never fall through after a partial write.
 */

export type ValueSynonymScope = "publisher" | "global"

function normaliseSynonymRaw(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().toLowerCase()
}

export type ValueSynonymRow = {
  id: number
  publisherId: number | null
  scope: ValueSynonymScope
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
}

type OverlayRow = ValueSynonymRow

const overlay: OverlayRow[] = []
let overlaySeq = 1

export function clearValueSynonymOverlayForTests() {
  overlay.length = 0
  overlaySeq = 1
}

export function getValueSynonymOverlayForTests(): readonly ValueSynonymRow[] {
  return overlay
}

function scopeOf(publisherId: number | null): ValueSynonymScope {
  return publisherId == null ? "global" : "publisher"
}

function toRow(row: OverlayRow): ValueSynonymRow {
  return { ...row, scope: scopeOf(row.publisherId) }
}

function overlayMatches(args: {
  vocabulary: string
  publisherId: number | null
}): ValueSynonymRow[] {
  return overlay
    .filter((row) => row.isActive && row.vocabulary === args.vocabulary)
    .filter(
      (row) =>
        row.publisherId == null ||
        (args.publisherId != null && row.publisherId === args.publisherId),
    )
    .map(toRow)
}

export async function listSynonymsFor(args: {
  vocabulary: string
  publisherId: number | null
}): Promise<ValueSynonymRow[]> {
  try {
    const { db } = await import("@/db")
    const { publisherValueSynonyms } = await import(
      "@/db/schema/publisherValueSynonyms"
    )
    const { and, eq, isNull, or } = await import("drizzle-orm")
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
    if (rows.length > 0 || overlay.length === 0) {
      return rows.map((row) => ({
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
      }))
    }
  } catch {
    // table missing / no DATABASE_URL — overlay
  }
  return overlayMatches(args)
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
    const { db } = await import("@/db")
    const { publisherValueSynonyms } = await import(
      "@/db/schema/publisherValueSynonyms"
    )
    const { eq, sql } = await import("drizzle-orm")
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
  const row = overlay.find((r) => r.id === args.id)
  if (row) {
    row.isActive = false
    row.retiredAt = new Date().toISOString()
    row.retiredBy = retiredBy
  }
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
  const rawValue = normaliseSynonymRaw(args.rawValue)
  const rawValueDisplay = args.rawValueDisplay.trim() || args.rawValue.trim()
  const avCanonical = args.avCanonical.trim()
  const learnedFromStageId = args.learnedFromStageId?.trim() || null
  const publisherId = args.publisherId

  let postgresWriteStarted = false
  try {
    const { db } = await import("@/db")
    const { publisherValueSynonyms } = await import(
      "@/db/schema/publisherValueSynonyms"
    )
    const { and, eq, isNull, sql } = await import("drizzle-orm")
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
      return {
        id: current.id,
        publisherId: current.publisherId ?? null,
        scope: scopeOf(current.publisherId ?? null),
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
      }
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
    const mapped: ValueSynonymRow = {
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
    upsertOverlay(mapped)
    return mapped
  } catch (err) {
    if (postgresWriteStarted) throw err
  }

  const current = overlay.find(
    (row) =>
      row.isActive &&
      row.vocabulary === args.vocabulary &&
      row.rawValue === rawValue &&
      (row.publisherId ?? null) === (publisherId ?? null),
  )
  if (current && current.avCanonical === avCanonical) {
    return toRow(current)
  }
  if (current) {
    current.isActive = false
    current.retiredAt = new Date().toISOString()
    current.retiredBy = createdBy
  }
  const created: OverlayRow = {
    id: overlaySeq++,
    publisherId,
    scope: scopeOf(publisherId),
    mediaType: args.mediaType,
    vocabulary: args.vocabulary,
    avField: args.avField,
    rawValue,
    rawValueDisplay,
    avCanonical,
    learnedFromStageId,
    createdBy,
    isActive: true,
    retiredAt: null,
    retiredBy: null,
  }
  overlay.push(created)
  return toRow(created)
}

function upsertOverlay(row: ValueSynonymRow) {
  const idx = overlay.findIndex((r) => r.id === row.id)
  if (idx >= 0) overlay[idx] = row
  else overlay.push(row)
}
