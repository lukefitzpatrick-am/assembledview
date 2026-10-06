/**
 * Postgres-authoritative media-details reference writes.
 * The Postgres insert is the whole function.
 */
import "server-only"

import { sql } from "drizzle-orm"
import { getDb, schema } from "@/db"
import {
  isReferenceTablePath,
  type ReferenceTablePath,
} from "@/lib/data/referenceTablePaths"
import { toApiRow } from "@/lib/data/toApiRow"

/** Browser/proxy write path → canonical table path. */
const WRITE_PATH_TO_TABLE: Record<string, ReferenceTablePath> = {
  POST_tv_stations: "tv_stations",
  POST_radio_stations: "radio_stations",
  POST_newspapers: "newspapers",
  POST_newspaper_adsizes: "newspaper_adsizes",
  POST_magazines: "magazines",
  POST_magazines_adsizes: "magazines_adsizes",
  tv_stations: "tv_stations",
  radio_stations: "radio_stations",
  newspapers: "newspapers",
  newspaper_adsizes: "newspaper_adsizes",
  magazines: "magazines",
  magazines_adsizes: "magazines_adsizes",
  audio_site: "audio_site",
  bvod_site: "bvod_site",
  display_site: "display_site",
  video_site: "video_site",
}

const TABLE_BY_PATH = {
  tv_stations: schema.tvStations,
  radio_stations: schema.radioStations,
  newspapers: schema.newspapers,
  newspaper_adsizes: schema.newspaperAdsizes,
  magazines: schema.magazines,
  magazines_adsizes: schema.magazinesAdsizes,
  audio_site: schema.audioSite,
  bvod_site: schema.bvodSite,
  display_site: schema.displaySite,
  video_site: schema.videoSite,
} as const

const WRITABLE_FIELDS: Record<ReferenceTablePath, readonly string[]> = {
  tv_stations: ["station", "network"],
  radio_stations: ["station", "network"],
  newspapers: ["title", "network"],
  newspaper_adsizes: ["adsize"],
  magazines: ["title", "network"],
  magazines_adsizes: ["adsize"],
  audio_site: ["platform", "site"],
  bvod_site: ["platform", "site"],
  display_site: ["platform", "site"],
  video_site: ["platform", "site"],
}

export function resolveReferenceWriteTable(path: string): ReferenceTablePath | null {
  const mapped = WRITE_PATH_TO_TABLE[path]
  if (mapped) return mapped
  return isReferenceTablePath(path) ? path : null
}

export function isReferenceWritePath(path: string): boolean {
  return resolveReferenceWriteTable(path) != null
}

function snakeToCamel(snake: string): string {
  return snake.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
}

export function normalizeReferenceWritePayload(
  table: ReferenceTablePath,
  body: Record<string, unknown>
): Record<string, unknown> {
  const allowed = new Set(WRITABLE_FIELDS[table])
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(body)) {
    if (!allowed.has(key)) continue
    if (value === undefined || value === null) continue
    if (typeof value === "string" && value.trim() === "") continue
    out[key] = typeof value === "string" ? value.trim() : value
  }
  for (const key of allowed) {
    if (out[key] == null || out[key] === "") {
      throw new Error(`Missing required fields: ${key}`)
    }
  }
  return out
}

function snakeToInsertValues(
  table: ReferenceTablePath,
  snake: Record<string, unknown>
): Record<string, unknown> {
  const values: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(snake)) {
    values[snakeToCamel(key)] = value
  }
  // Satisfy unused table param for future per-table coercions
  void table
  return values
}

export async function syncReferenceTableIdSequence(table: ReferenceTablePath): Promise<void> {
  // `table` is allowlisted ReferenceTablePath — safe for identifier interpolation.
  const db = getDb()
  await db.execute(
    sql.raw(`
      SELECT setval(
        pg_get_serial_sequence('${table}', 'id'),
        COALESCE((SELECT MAX(id) FROM ${table}), 1),
        true
      )
    `)
  )
}

export type ReferenceWriteResult = {
  row: Record<string, unknown>
  table: ReferenceTablePath
}

/**
 * PG-first create for an allowlisted media-details write path
 * (`POST_tv_stations`, `audio_site`, …).
 */
export async function createReferenceMediaDetailPostgresFirst(
  xanoPath: string,
  body: Record<string, unknown>
): Promise<ReferenceWriteResult> {
  const table = resolveReferenceWriteTable(xanoPath)
  if (!table) {
    throw new Error(`Not a reference write path: ${xanoPath}`)
  }
  const snake = normalizeReferenceWritePayload(table, body)
  await syncReferenceTableIdSequence(table)

  const db = getDb()
  const drizzleTable = TABLE_BY_PATH[table]
  const [inserted] = await db
    .insert(drizzleTable)
    .values(snakeToInsertValues(table, snake) as never)
    .returning()
  if (!inserted || (inserted as { id?: number }).id == null) {
    throw new Error(`Postgres ${table} insert returned no id`)
  }
  const row = toApiRow(inserted as Record<string, unknown>)
  return { row, table }
}
