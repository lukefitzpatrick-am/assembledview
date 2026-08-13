/**
 * Load publisher_profiles for admin / ingest.
 * Prefers Postgres when reachable; falls back to seed JSON (same payload as 0024).
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import {
  parsePublisherProfile,
  type PublisherProfileConfig,
} from "@/lib/mediaplans/ingest/publisherProfileConfig"

const SEED_PATH = path.join(
  process.cwd(),
  "lib/mediaplans/ingest/seeds/publisherProfiles.json",
)

export function loadSeedPublisherProfiles(): PublisherProfileConfig[] {
  const raw = JSON.parse(readFileSync(SEED_PATH, "utf8")) as unknown[]
  return raw.map((row) => parsePublisherProfile(row))
}

export async function listPublisherProfiles(): Promise<{
  profiles: PublisherProfileConfig[]
  source: "postgres" | "seed"
}> {
  const { profilesWithRemapOverlay } = await import(
    "@/lib/mediaplans/ingest/persistColumnRemap"
  )
  try {
    const { db } = await import("@/db")
    const { publisherProfiles } = await import("@/db/schema/publisherProfiles")
    const rows = await db.select().from(publisherProfiles)
    if (rows.length > 0) {
      const profiles = rows.map((row) =>
        parsePublisherProfile({
          publisher_name: row.publisherName,
          publisher_id: row.publisherId ?? null,
          media_type: row.mediaType,
          active: row.active,
          detect_signature: row.detectSignature,
          grouping_keys: (row.detectSignature as { grouping_keys?: string[] })
            ?.grouping_keys,
          column_map: row.columnMap,
          grid_semantics: row.gridSemantics,
          legend_map: row.legendMap,
          sheet_rules: row.sheetRules,
          notes: row.notes,
        }),
      )
      return { profiles: profilesWithRemapOverlay(profiles), source: "postgres" }
    }
  } catch {
    // Migration not applied / DB unavailable — seed is authoritative for local.
  }
  return {
    profiles: profilesWithRemapOverlay(loadSeedPublisherProfiles()),
    source: "seed",
  }
}
