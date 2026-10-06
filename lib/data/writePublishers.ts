/**
 * Postgres-authoritative publisher writes.
 * The Postgres insert or update is the whole function.
 */
import "server-only"

import { eq, sql } from "drizzle-orm"
import { getDb, schema } from "@/db"
import { invalidatePublishersCache } from "@/lib/api/publishersCache"
import { invalidateCachedPublishers } from "@/lib/finance/xanoReferenceCache"
import { bodyForPublisherPut } from "@/lib/publisher/normalizePublisher"
import { mapPublisherRowFromPostgres } from "@/lib/data/readPublishers"

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

export async function findPublisherByBusinessId(
  publisherid: string
): Promise<Record<string, unknown> | null> {
  const key = String(publisherid ?? "").trim()
  if (!key) return null
  const db = getDb()
  const [row] = await db
    .select()
    .from(schema.publishers)
    .where(eq(schema.publishers.publisherid, key))
    .limit(1)
  return row ? mapPublisherRowFromPostgres(row as Record<string, unknown>) : null
}

export async function isPublisherIdUnique(publisherid: string): Promise<boolean> {
  const found = await findPublisherByBusinessId(publisherid)
  return found == null
}

export async function createPublisherPostgresFirst(
  body: Record<string, unknown>
): Promise<PublisherWriteResult> {
  const snake = normalizePublisherWritePayload(body, { requireIdentity: true })
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

export async function updatePublisherPostgresFirst(
  publisherBusinessId: string,
  body: Record<string, unknown>
): Promise<PublisherWriteResult | { notFound: true }> {
  const existing = await findPublisherByBusinessId(publisherBusinessId)
  if (!existing?.id) return { notFound: true }
  const numericId = Number(existing.id)
  if (!Number.isFinite(numericId) || numericId <= 0) return { notFound: true }

  const snake = normalizePublisherWritePayload(body, { requireIdentity: false })
  if (Object.keys(snake).length === 0) {
    return { row: existing }
  }

  const db = getDb()
  const [updated] = await db
    .update(schema.publishers)
    .set(snakeToInsertValues(snake))
    .where(eq(schema.publishers.id, numericId))
    .returning()
  if (!updated) return { notFound: true }

  invalidateAllPublishersCaches()
  const row = mapPublisherRowFromPostgres(updated as Record<string, unknown>)
  return { row }
}
