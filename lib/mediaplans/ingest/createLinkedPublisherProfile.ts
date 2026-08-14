/**
 * First-upload profile create: human picks a catalogue publisher; we never guess.
 * Linked by publishers.id. Existing four-row names stay short (QMS/SCA/…).
 */

import {
  parsePublisherProfile,
  type GridSemantics,
  type PublisherProfileConfig,
} from "@/lib/mediaplans/ingest/publisherProfileConfig"
import {
  findProfileForCataloguePublisher,
  profileNameForCatalogueId,
} from "@/lib/mediaplans/ingest/publisherCatalogueJoin"
import { loadSeedPublisherProfiles } from "@/lib/mediaplans/ingest/loadPublisherProfiles"
import {
  clearPublisherProfileSeedOverlayForTests,
  registerPublisherProfileOverlay,
} from "@/lib/mediaplans/ingest/persistColumnRemap"

export type CataloguePublisherRef = {
  id: number
  publisher_name: string
  publisherid?: string | null
  pub_ooh?: boolean | null
  pub_radio?: boolean | null
}

const createdByCatalogueId = new Map<number, PublisherProfileConfig>()

export function clearLinkedProfileOverlayForTests() {
  createdByCatalogueId.clear()
  clearPublisherProfileSeedOverlayForTests()
}

export function mediaTypeFromCatalogue(catalogue: CataloguePublisherRef): string {
  if (catalogue.pub_ooh && !catalogue.pub_radio) return "ooh"
  if (catalogue.pub_radio && !catalogue.pub_ooh) return "radio"
  if (catalogue.pub_ooh) return "ooh"
  if (catalogue.pub_radio) return "radio"
  return "ooh"
}

function emptyProfileForCatalogue(
  catalogue: CataloguePublisherRef,
): PublisherProfileConfig {
  const media_type = mediaTypeFromCatalogue(catalogue)
  const grid_semantics: GridSemantics =
    media_type === "ooh" ? "status_matrix" : "count"
  return parsePublisherProfile({
    publisher_name: catalogue.publisher_name.trim(),
    publisher_id: catalogue.id,
    media_type,
    active: true,
    detect_signature: {},
    grouping_keys: [],
    line_granularity: "per_row",
    column_map: {},
    grid_semantics,
    legend_map: {},
    sheet_rules: [
      {
        match: { any_line_item_sheet: true },
        role: "line_items",
        default_booking_status: "paid",
      },
    ],
    notes:
      "Created from first ingest upload; mapping is empty until a human remaps.",
  })
}

function withCatalogueId(
  profile: PublisherProfileConfig,
  catalogueId: number,
): PublisherProfileConfig {
  if (profile.publisher_id === catalogueId) return profile
  return { ...profile, publisher_id: catalogueId }
}

export async function createLinkedPublisherProfile(args: {
  catalogue: CataloguePublisherRef
  /** Ignored — never used as the profile name. */
  guessedFilePublisherName?: string | null
}): Promise<PublisherProfileConfig> {
  void args.guessedFilePublisherName
  const { catalogue } = args
  const cached = createdByCatalogueId.get(catalogue.id)
  if (cached) return cached

  const knownName = profileNameForCatalogueId(catalogue.id)
  const existing = findProfileForCataloguePublisher(
    [
      ...createdByCatalogueId.values(),
      ...loadSeedPublisherProfiles(),
    ],
    catalogue,
  )
  if (existing) {
    const linked = withCatalogueId(
      existing as PublisherProfileConfig,
      catalogue.id,
    )
    createdByCatalogueId.set(catalogue.id, linked)
    registerPublisherProfileOverlay(linked)
    return linked
  }
  if (knownName) {
    const seed = loadSeedPublisherProfiles().find(
      (p) => p.publisher_name === knownName,
    )
    if (seed) {
      const linked = withCatalogueId(seed, catalogue.id)
      createdByCatalogueId.set(catalogue.id, linked)
      registerPublisherProfileOverlay(linked)
      return linked
    }
  }

  const created = emptyProfileForCatalogue(catalogue)
  try {
    const { db } = await import("@/db")
    const { publisherProfiles } = await import("@/db/schema/publisherProfiles")
    await db.insert(publisherProfiles).values({
      publisherName: created.publisher_name,
      publisherId: created.publisher_id,
      mediaType: created.media_type,
      active: created.active,
      detectSignature: created.detect_signature,
      columnMap: created.column_map,
      gridSemantics: created.grid_semantics,
      lineGranularity: created.line_granularity,
      legendMap: created.legend_map,
      sheetRules: created.sheet_rules,
      notes: created.notes,
    })
  } catch {
    // Unique name / missing publisher_id column / no DB — overlay is enough.
  }
  createdByCatalogueId.set(catalogue.id, created)
  registerPublisherProfileOverlay(created)
  return created
}
