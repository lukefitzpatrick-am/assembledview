/**
 * Persist a corrected column mapping onto a publisher_profiles row.
 * Writes Postgres when available; otherwise mutates the in-memory/seed
 * store used by tests and local fallback.
 */

import {
  parsePublisherProfile,
  type PublisherProfileConfig,
} from "@/lib/mediaplans/ingest/publisherProfileConfig"
import { loadSeedPublisherProfiles } from "@/lib/mediaplans/ingest/loadPublisherProfiles"

/** Process-local overlay so remaps stick across requests when DB is unavailable. */
const seedOverlay = new Map<string, PublisherProfileConfig>()

export function clearPublisherProfileSeedOverlayForTests() {
  seedOverlay.clear()
}

export function getPublisherProfileSeedOverlay(): Map<
  string,
  PublisherProfileConfig
> {
  return seedOverlay
}

export function registerPublisherProfileOverlay(
  profile: PublisherProfileConfig,
) {
  seedOverlay.set(keyOf(profile.publisher_name), profile)
}

function keyOf(name: string): string {
  return name.trim().toLowerCase()
}

export function applyColumnRemap(
  profile: PublisherProfileConfig,
  header: string,
  mappedTo: string | null,
): PublisherProfileConfig {
  const nextMap = { ...profile.column_map }
  const headerKey = Object.keys(nextMap).find(
    (k) => k.replace(/\s+/g, " ").trim().toLowerCase() ===
      header.replace(/\s+/g, " ").trim().toLowerCase(),
  )
  if (mappedTo == null || mappedTo === "" || mappedTo === "__unmap__") {
    if (headerKey) delete nextMap[headerKey]
    else {
      // header was never mapped — nothing to delete
    }
  } else {
    const storeKey = headerKey ?? header
    nextMap[storeKey] = mappedTo
  }
  return parsePublisherProfile({
    ...profile,
    column_map: nextMap,
  })
}

export async function persistColumnRemap(args: {
  publisherName: string
  header: string
  mappedTo: string | null
}): Promise<{
  profile: PublisherProfileConfig
  source: "postgres" | "seed"
}> {
  const { publisherName, header, mappedTo } = args

  try {
    const { db } = await import("@/db")
    const { publisherProfiles } = await import("@/db/schema/publisherProfiles")
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
        column_map: rows[0].columnMap,
        grid_semantics: rows[0].gridSemantics,
        legend_map: rows[0].legendMap,
        sheet_rules: rows[0].sheetRules,
        notes: rows[0].notes,
      })
      const updated = applyColumnRemap(current, header, mappedTo)
      await db
        .update(publisherProfiles)
        .set({
          columnMap: updated.column_map,
          updatedAt: sql`now()`,
        })
        .where(eq(publisherProfiles.publisherName, publisherName))
      seedOverlay.set(keyOf(publisherName), updated)
      return { profile: updated, source: "postgres" }
    }
  } catch {
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
  const updated = applyColumnRemap(base, header, mappedTo)
  seedOverlay.set(keyOf(publisherName), updated)
  return { profile: updated, source: "seed" }
}

/** Profiles with seed overlay applied (for review after remap without DB). */
export function profilesWithRemapOverlay(
  profiles: PublisherProfileConfig[],
): PublisherProfileConfig[] {
  return profiles.map((p) => seedOverlay.get(keyOf(p.publisher_name)) ?? p)
}
