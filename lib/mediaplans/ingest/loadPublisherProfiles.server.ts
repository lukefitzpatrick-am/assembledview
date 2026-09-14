/**
 * Server-only publisher_profiles list (Postgres, seed overlay fallback).
 * Never imported from Client Components.
 */
import "server-only"

import { db } from "@/db"
import { publisherProfiles } from "@/db/schema/publisherProfiles"
import { loadSeedPublisherProfiles } from "@/lib/mediaplans/ingest/loadPublisherProfiles"
import { profilesWithRemapOverlay } from "@/lib/mediaplans/ingest/persistColumnRemap"
import {
  parsePublisherProfile,
  type PublisherProfileConfig,
} from "@/lib/mediaplans/ingest/publisherProfileConfig"

export async function listPublisherProfiles(): Promise<{
  profiles: PublisherProfileConfig[]
  source: "postgres" | "seed"
}> {
  try {
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
          line_granularity: row.lineGranularity,
          column_map: row.columnMap,
          field_defaults: row.fieldDefaults ?? {},
          money_rules: row.moneyRules ?? {},
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
