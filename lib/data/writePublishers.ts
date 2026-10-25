/**
 * Postgres-authoritative publisher writes.
 * The Postgres insert or update is the whole function.
 */
import "server-only"

import { asc, eq, sql } from "drizzle-orm"
import { getDb, schema } from "@/db"
import { invalidatePublishersCache } from "@/lib/api/publishersCache"
import { invalidateCachedPublishers } from "@/lib/finance/xanoReferenceCache"
import { bodyForPublisherPut } from "@/lib/publisher/normalizePublisher"
import { mapPublisherRowFromPostgres } from "@/lib/data/readPublishers"
import {
  findPublisherIdentityConflicts,
  publisherIdentityConflictMessages,
  publisherIdentityKey,
  type PublisherIdentityField,
  type PublisherIdentityRow,
} from "@/lib/publisher/publisherUniqueness"

/** Columns publishers writes may set (API snake_case → drizzle). */
const WRITABLE_SNAKE_TO_CAMEL: Record<string, keyof typeof schema.publishers.$inferInsert> = {
  publisher_name: "publisherName",
  publisherid: "publisherid",
  publishertype: "publishertype",
  billingagency: "billingagency",
  financecode: "financecode",
  pub_television: "pubTelevision",
  pub_radio: "pubRadio",
  pub_newspaper: "pubNewspaper",
  pub_magazines: "pubMagazines",
  pub_ooh: "pubOoh",
  pub_cinema: "pubCinema",
  pub_digidisplay: "pubDigidisplay",
  pub_digiaudio: "pubDigiaudio",
  pub_digivideo: "pubDigivideo",
  pub_bvod: "pubBvod",
  pub_integration: "pubIntegration",
  pub_search: "pubSearch",
  pub_socialmedia: "pubSocialmedia",
  pub_progdisplay: "pubProgdisplay",
  pub_progvideo: "pubProgvideo",
  pub_progbvod: "pubProgbvod",
  pub_progaudio: "pubProgaudio",
  pub_progooh: "pubProgooh",
  pub_influencers: "pubInfluencers",
  radio_comms: "radioComms",
  newspaper_comms: "newspaperComms",
  television_comms: "televisionComms",
  magazines_comms: "magazinesComms",
  ooh_comms: "oohComms",
  cinema_comms: "cinemaComms",
  digidisplay_comms: "digidisplayComms",
  digiaudio_comms: "digiaudioComms",
  digivideo_comms: "digivideoComms",
  bvod_comms: "bvodComms",
  integration_comms: "integrationComms",
  search_comms: "searchComms",
  progdisplay_comms: "progdisplayComms",
  progvideo_comms: "progvideoComms",
  progbvod_comms: "progbvodComms",
  progaudio_comms: "progaudioComms",
  progooh_comms: "progoohComms",
  influencers_comms: "influencersComms",
  digitaldisplay_cpm_default: "digitaldisplayCpmDefault",
  digitaldisplay_cpc_default: "digitaldisplayCpcDefault",
  digitaldisplay_cpv_default: "digitaldisplayCpvDefault",
  digitaldisplay_ctr_default: "digitaldisplayCtrDefault",
  digitaldisplay_vtr_default: "digitaldisplayVtrDefault",
  digitaldisplay_frequency_default: "digitaldisplayFrequencyDefault",
  digitalvideo_cpm_default: "digitalvideoCpmDefault",
  digitalvideo_cpc_default: "digitalvideoCpcDefault",
  digitalvideo_cpv_default: "digitalvideoCpvDefault",
  digitalvideo_ctr_default: "digitalvideoCtrDefault",
  digitalvideo_vtr_default: "digitalvideoVtrDefault",
  digitalvideo_frequency_default: "digitalvideoFrequencyDefault",
  digitalaudio_cpm_default: "digitalaudioCpmDefault",
  digitalaudio_cpc_default: "digitalaudioCpcDefault",
  digitalaudio_cpv_default: "digitalaudioCpvDefault",
  digitalaudio_ctr_default: "digitalaudioCtrDefault",
  digitalaudio_vtr_default: "digitalaudioVtrDefault",
  digitalaudio_frequency_default: "digitalaudioFrequencyDefault",
  bvod_cpm_default: "bvodCpmDefault",
  bvod_cpc_default: "bvodCpcDefault",
  bvod_cpv_default: "bvodCpvDefault",
  bvod_ctr_default: "bvodCtrDefault",
  bvod_vtr_default: "bvodVtrDefault",
  bvod_frequency_default: "bvodFrequencyDefault",
  search_cpm_default: "searchCpmDefault",
  search_cpc_default: "searchCpcDefault",
  search_cpv_default: "searchCpvDefault",
  search_ctr_default: "searchCtrDefault",
  search_vtr_default: "searchVtrDefault",
  search_frequency_default: "searchFrequencyDefault",
  socialmedia_cpm_default: "socialmediaCpmDefault",
  socialmedia_cpc_default: "socialmediaCpcDefault",
  socialmedia_cpv_default: "socialmediaCpvDefault",
  socialmedia_ctr_default: "socialmediaCtrDefault",
  socialmedia_vtr_default: "socialmediaVtrDefault",
  socialmedia_frequency_default: "socialmediaFrequencyDefault",
  progdisplay_cpm_default: "progdisplayCpmDefault",
  progdisplay_cpc_default: "progdisplayCpcDefault",
  progdisplay_cpv_default: "progdisplayCpvDefault",
  progdisplay_ctr_default: "progdisplayCtrDefault",
  progdisplay_vtr_default: "progdisplayVtrDefault",
  progdisplay_frequency_default: "progdisplayFrequencyDefault",
  progvideo_cpm_default: "progvideoCpmDefault",
  progvideo_cpc_default: "progvideoCpcDefault",
  progvideo_cpv_default: "progvideoCpvDefault",
  progvideo_ctr_default: "progvideoCtrDefault",
  progvideo_vtr_default: "progvideoVtrDefault",
  progvideo_frequency_default: "progvideoFrequencyDefault",
  progbvod_cpm_default: "progbvodCpmDefault",
  progbvod_cpc_default: "progbvodCpcDefault",
  progbvod_cpv_default: "progbvodCpvDefault",
  progbvod_ctr_default: "progbvodCtrDefault",
  progbvod_vtr_default: "progbvodVtrDefault",
  progbvod_frequency_default: "progbvodFrequencyDefault",
  progaudio_cpm_default: "progaudioCpmDefault",
  progaudio_cpc_default: "progaudioCpcDefault",
  progaudio_cpv_default: "progaudioCpvDefault",
  progaudio_ctr_default: "progaudioCtrDefault",
  progaudio_vtr_default: "progaudioVtrDefault",
  progaudio_frequency_default: "progaudioFrequencyDefault",
  publisher_colour: "publisherColour",
  best_practice: "bestPractice",
}

export function normalizePublisherWritePayload(
  body: Record<string, unknown>,
  options: { requireIdentity?: boolean } = {}
): Record<string, unknown> {
  const requireIdentity = options.requireIdentity !== false
  const normalized = bodyForPublisherPut(body)
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(normalized)) {
    if (value === undefined) continue
    if (!(key in WRITABLE_SNAKE_TO_CAMEL)) continue
    out[key] = value
  }
  if (requireIdentity) {
    const missing: string[] = []
    if (!out.publisher_name || String(out.publisher_name).trim() === "") {
      missing.push("publisher_name")
    }
    if (!out.publisherid || String(out.publisherid).trim() === "") {
      missing.push("publisherid")
    }
    if (missing.length > 0) {
      throw new Error(`Missing required fields: ${missing.join(", ")}`)
    }
  }
  return out
}

function snakeToInsertValues(
  snake: Record<string, unknown>
): typeof schema.publishers.$inferInsert {
  const values: Record<string, unknown> = {}
  for (const [snakeKey, value] of Object.entries(snake)) {
    const camel = WRITABLE_SNAKE_TO_CAMEL[snakeKey]
    if (!camel) continue
    values[camel] = value
  }
  return values as typeof schema.publishers.$inferInsert
}

/** Drop publishers list caches (10min API + 30s finance reference + browser coalesced). */
export function invalidateAllPublishersCaches(): void {
  invalidatePublishersCache()
  invalidateCachedPublishers()
}

export async function syncPublishersIdSequence(): Promise<void> {
  const db = getDb()
  await db.execute(sql`
    SELECT setval(
      pg_get_serial_sequence('publishers', 'id'),
      COALESCE((SELECT MAX(id) FROM publishers), 1),
      true
    )
  `)
}

export type PublisherWriteResult = {
  row: Record<string, unknown>
}

/**
 * Thrown when a create or edit would give a publisher a name or publisherid
 * that another publisher already has (INVARIANTS: publisher names and ids are
 * unique). The route answers 409 with `fieldErrors` so the form can show them.
 */
export class PublisherIdentityConflictError extends Error {
  readonly fieldErrors: Partial<Record<PublisherIdentityField, string>>
  constructor(fieldErrors: Partial<Record<PublisherIdentityField, string>>) {
    super(Object.values(fieldErrors).join(" "))
    this.name = "PublisherIdentityConflictError"
    this.fieldErrors = fieldErrors
  }
}

/** Thrown when a save names a publisher only by a publisherid that several rows share. */
export class PublisherAmbiguousBusinessIdError extends Error {
  readonly rowIds: number[]
  constructor(publisherid: string, rowIds: number[]) {
    super(
      `Publisher ID "${publisherid}" is shared by records ${rowIds.map((id) => `#${id}`).join(", ")}. ` +
        `Reload the publisher and save again so the record is saved by its own id.`,
    )
    this.name = "PublisherAmbiguousBusinessIdError"
    this.rowIds = rowIds
  }
}

async function loadPublisherIdentityRows(): Promise<PublisherIdentityRow[]> {
  const db = getDb()
  const rows = await db
    .select({
      id: schema.publishers.id,
      publisher_name: schema.publishers.publisherName,
      publisherid: schema.publishers.publisherid,
    })
    .from(schema.publishers)
    .orderBy(asc(schema.publishers.id))
  return rows as PublisherIdentityRow[]
}

/** Rejects a name or publisherid already used by another row (case and spaces ignored). */
async function assertPublisherIdentityUnique(
  candidate: Pick<PublisherIdentityRow, "publisher_name" | "publisherid">,
  selfId: number | null,
): Promise<void> {
  const existing = await loadPublisherIdentityRows()
  const conflicts = findPublisherIdentityConflicts(candidate, existing, selfId)
  const fieldErrors = publisherIdentityConflictMessages(candidate, conflicts)
  if (Object.keys(fieldErrors).length > 0) {
    throw new PublisherIdentityConflictError(fieldErrors)
  }
}

/** Every row whose publisherid matches (case and spaces ignored), lowest id first. */
async function findPublisherRowsByBusinessId(
  publisherid: string,
): Promise<Record<string, unknown>[]> {
  const key = String(publisherid ?? "").trim()
  if (!key) return []
  const db = getDb()
  const rows = await db
    .select()
    .from(schema.publishers)
    .where(sql`lower(trim(${schema.publishers.publisherid})) = lower(${key})`)
    .orderBy(asc(schema.publishers.id))
  return rows.map((row) => mapPublisherRowFromPostgres(row as Record<string, unknown>))
}

/** Lowest-id row with this publisherid (case and spaces ignored), or null. */
export async function findPublisherByBusinessId(
  publisherid: string
): Promise<Record<string, unknown> | null> {
  const rows = await findPublisherRowsByBusinessId(publisherid)
  return rows[0] ?? null
}

/** True when no publisher uses this publisherid (case and spaces ignored). */
export async function isPublisherIdUnique(publisherid: string): Promise<boolean> {
  const found = await findPublisherByBusinessId(publisherid)
  return found == null
}

export async function createPublisherPostgresFirst(
  body: Record<string, unknown>
): Promise<PublisherWriteResult> {
  const snake = normalizePublisherWritePayload(body, { requireIdentity: true })
  await assertPublisherIdentityUnique(
    { publisher_name: String(snake.publisher_name), publisherid: String(snake.publisherid) },
    null,
  )
  await syncPublishersIdSequence()
  const db = getDb()
  const [inserted] = await db
    .insert(schema.publishers)
    .values(snakeToInsertValues(snake))
    .returning()
  if (!inserted?.id) {
    throw new Error("Postgres publishers insert returned no id")
  }
  invalidateAllPublishersCaches()
  const row = mapPublisherRowFromPostgres(inserted as Record<string, unknown>)
  return { row }
}

function decodePublisherSegment(segment: string): string {
  const trimmed = String(segment ?? "").trim()
  try {
    return decodeURIComponent(trimmed).trim()
  } catch {
    return trimmed
  }
}

/** Positive integer primary key from a request body `id`, or null. */
export function publisherRowIdFromBody(body: Record<string, unknown>): number | null {
  const n = Number(body.id)
  return Number.isInteger(n) && n > 0 ? n : null
}

/**
 * Update one publisher by its primary key `publishers.id`. Never by
 * publisherid: two rows sharing a publisherid used to make edits land on the
 * wrong row (23 Oct 2026, Broadsheet #33 / #62).
 */
export async function updatePublisherByRowId(
  rowId: number,
  body: Record<string, unknown>,
  options: { expectedPublisherid?: string } = {}
): Promise<PublisherWriteResult | { notFound: true }> {
  if (!Number.isInteger(rowId) || rowId <= 0) return { notFound: true }
  const db = getDb()
  const [current] = await db
    .select()
    .from(schema.publishers)
    .where(eq(schema.publishers.id, rowId))
    .limit(1)
  if (!current) return { notFound: true }
  const existing = mapPublisherRowFromPostgres(current as Record<string, unknown>)
  // The URL names the record by its current publisherid. A body id for a
  // different record is a stale or mismatched form, never a silent save.
  if (
    options.expectedPublisherid != null &&
    publisherIdentityKey(existing.publisherid) !== publisherIdentityKey(options.expectedPublisherid)
  ) {
    return { notFound: true }
  }

  const snake = normalizePublisherWritePayload(body, { requireIdentity: false })
  if (Object.keys(snake).length === 0) {
    return { row: existing }
  }

  await assertPublisherIdentityUnique(
    {
      publisher_name: String(snake.publisher_name ?? existing.publisher_name ?? ""),
      publisherid: String(snake.publisherid ?? existing.publisherid ?? ""),
    },
    rowId,
  )

  const [updated] = await db
    .update(schema.publishers)
    .set(snakeToInsertValues(snake))
    .where(eq(schema.publishers.id, rowId))
    .returning()
  if (!updated) return { notFound: true }

  invalidateAllPublishersCaches()
  const row = mapPublisherRowFromPostgres(updated as Record<string, unknown>)
  return { row }
}

/**
 * PUT /api/publishers/[publisherId]. Saves by the body's primary key `id`
 * when given (the edit form always sends it). Without one, the URL
 * publisherid must name exactly one row; a shared publisherid is refused
 * rather than guessed.
 */
export async function updatePublisherPostgresFirst(
  publisherBusinessId: string,
  body: Record<string, unknown>
): Promise<PublisherWriteResult | { notFound: true }> {
  const businessId = decodePublisherSegment(publisherBusinessId)
  const rowId = publisherRowIdFromBody(body)
  if (rowId != null) {
    return updatePublisherByRowId(rowId, body, { expectedPublisherid: businessId })
  }

  const matches = await findPublisherRowsByBusinessId(businessId)
  if (matches.length === 0) return { notFound: true }
  if (matches.length > 1) {
    throw new PublisherAmbiguousBusinessIdError(
      businessId,
      matches.map((m) => Number(m.id)),
    )
  }
  return updatePublisherByRowId(Number(matches[0].id), body)
}
