import "server-only"

import { getDb, schema } from "@/db"
import {
  isReferenceTablePath,
  type ReferenceTablePath,
} from "@/lib/data/referenceTablePaths"

export {
  REFERENCE_TABLE_PATHS,
  isReferenceTablePath,
  type ReferenceTablePath,
} from "@/lib/data/referenceTablePaths"

/** Drizzle camelCase → Xano/API snake_case keys clients already consume. */
function toApiRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) {
    const snake = key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)
    out[snake] = value
  }
  return out
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

export async function fetchReferenceTableFromPostgres(
  path: ReferenceTablePath
): Promise<Record<string, unknown>[]> {
  if (!isReferenceTablePath(path)) {
    throw new Error(`Not a reference table path: ${path}`)
  }
  const db = getDb()
  const table = TABLE_BY_PATH[path]
  const rows = await db.select().from(table)
  return rows.map((row) => toApiRow(row as Record<string, unknown>))
}
