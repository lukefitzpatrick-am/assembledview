/**
 * Insert a planner-confirmed model-proposed publisher profile, then the
 * normal ingest pipeline may load it. Never inserts or loads an unconfirmed
 * draft. Notes stamp: "model-proposed, confirmed by <user>".
 */

import type { IngestReviewPackage } from "@/lib/mediaplans/ingest/buildIngestReview"
import {
  mediaTypeFromCatalogue,
  registerLinkedPublisherProfile,
  type CataloguePublisherRef,
} from "@/lib/mediaplans/ingest/createLinkedPublisherProfile"
import {
  SOURCE_FILE_MISSING,
  reparseStagedIngestFromSourceFile,
} from "@/lib/mediaplans/ingest/ingestSourceFile"
import { lookupIngestStage } from "@/lib/mediaplans/ingest/ingestStageStore"
import type { LineAuditClient } from "@/lib/mediaplans/ingest/lineAudit"
import {
  recordPublisherProfileSeedAudits,
  registerPublisherProfileOverlay,
  type PublisherProfileAuditSeedRow,
  type RemapSource,
} from "@/lib/mediaplans/ingest/persistColumnRemap"
import {
  parsePublisherProfile,
  type PublisherProfileConfig,
} from "@/lib/mediaplans/ingest/publisherProfileConfig"

export const MODEL_PROPOSED_SOURCE: RemapSource = "model_proposed"

export function modelProposedNotes(confirmedBy: string): string {
  return `model-proposed, confirmed by ${confirmedBy.trim()}`
}

export function attachCatalogueToDraft(
  draft: PublisherProfileConfig,
  catalogue: CataloguePublisherRef,
): PublisherProfileConfig {
  const media_type =
    draft.media_type === "ooh" || draft.media_type === "radio"
      ? draft.media_type
      : mediaTypeFromCatalogue(catalogue)
  return parsePublisherProfile({
    ...draft,
    publisher_name: catalogue.publisher_name.trim(),
    publisher_id: catalogue.id,
    media_type,
  })
}

export function stampCatalogueOnDraft(
  draft: PublisherProfileConfig,
  catalogue: CataloguePublisherRef,
  confirmedBy: string,
): PublisherProfileConfig {
  const media_type =
    draft.media_type === "ooh" || draft.media_type === "radio"
      ? draft.media_type
      : mediaTypeFromCatalogue(catalogue)
  return parsePublisherProfile({
    ...draft,
    publisher_name: catalogue.publisher_name.trim(),
    publisher_id: catalogue.id,
    media_type,
    notes: modelProposedNotes(confirmedBy),
  })
}

function auditRowsForInsert(
  profile: PublisherProfileConfig,
  confirmedBy: string,
  stageId: string | null,
): PublisherProfileAuditSeedRow[] {
  return Object.entries(profile.column_map).map(([header, next_value]) => ({
    action: "map" as const,
    field: "column_map" as const,
    header,
    previous_value: null,
    next_value,
    changed_by: confirmedBy,
    source: MODEL_PROPOSED_SOURCE,
    stage_id: stageId,
    publisher_name: profile.publisher_name,
  }))
}

async function insertConfirmedProfile(
  profile: PublisherProfileConfig,
  confirmedBy: string,
  stageId: string | null,
): Promise<void> {
  const rows = auditRowsForInsert(profile, confirmedBy, stageId)
  try {
    const { db } = await import("@/db")
    const { publisherProfiles, publisherProfileChanges } = await import(
      "@/db/schema/publisherProfiles"
    )
    const inserted = await db
      .insert(publisherProfiles)
      .values({
        publisherName: profile.publisher_name,
        publisherId: profile.publisher_id,
        mediaType: profile.media_type,
        active: profile.active,
        detectSignature: profile.detect_signature,
        columnMap: profile.column_map,
        fieldDefaults: profile.field_defaults,
        moneyRules: profile.money_rules,
        gridSemantics: profile.grid_semantics,
        lineGranularity: profile.line_granularity,
        legendMap: profile.legend_map,
        sheetRules: profile.sheet_rules,
        notes: profile.notes,
        updatedBy: confirmedBy,
      })
      .returning({ id: publisherProfiles.id })
    const profileId = inserted[0]?.id
    if (profileId != null) {
      if (rows.length > 0) {
        await db.insert(publisherProfileChanges).values(
          rows.map((row) => ({
            publisherProfileId: profileId,
            publisherName: row.publisher_name,
            field: row.field,
            header: row.header,
            previousValue: row.previous_value,
            nextValue: row.next_value,
            action: row.action,
            changedBy: row.changed_by,
            source: row.source,
            stageId: row.stage_id,
          })),
        )
      }
    }
  } catch {
    // Unique name / money_rules column not applied / no DB — overlay is enough.
  }
  recordPublisherProfileSeedAudits(rows)
  registerPublisherProfileOverlay(profile)
  registerLinkedPublisherProfile(profile)
}

export async function confirmProposedPublisherProfile(args: {
  review: IngestReviewPackage
  confirmedBy: string
  catalogue: CataloguePublisherRef
  stageId?: string | null
}): Promise<
  { ok: true; profile: PublisherProfileConfig } | { ok: false; error: string }
> {
  const confirmedBy = args.confirmedBy.trim()
  if (!confirmedBy) {
    return { ok: false, error: "confirmedBy is required (do not default)" }
  }
  const draft = args.review.proposed_profile?.draft
  if (!draft || args.review.proposed_profile?.confirmed === true) {
    return {
      ok: false,
      error: "There is no unconfirmed proposed profile to insert.",
    }
  }
  const profile = stampCatalogueOnDraft(draft, args.catalogue, confirmedBy)
  await insertConfirmedProfile(profile, confirmedBy, args.stageId?.trim() || null)
  return { ok: true, profile }
}

/**
 * Confirm the staged proposed profile, then re-parse from source_file.
 * 409 SOURCE_FILE_MISSING before insert when the stage has no workbook
 * (pre-IG-14). Callers without a stage keep using confirmProposedPublisherProfile.
 */
export async function confirmStagedProposedProfile(args: {
  stageId: string
  confirmedBy: string
  catalogue: CataloguePublisherRef
  profiles: PublisherProfileConfig[]
  lineAuditClient?: LineAuditClient | null
}): Promise<
  | {
      ok: true
      status: 200
      profile: PublisherProfileConfig
      review: IngestReviewPackage
    }
  | {
      ok: false
      status: 409
      code?: typeof SOURCE_FILE_MISSING
      error: string
    }
  | { ok: false; status: 404; error: string }
> {
  const looked = await lookupIngestStage(args.stageId)
  if (!looked.ok) {
    return { ok: false, status: 404, error: "Staged ingest not found" }
  }
  if (!looked.staged.sourceFile) {
    return {
      ok: false,
      status: 409,
      code: SOURCE_FILE_MISSING,
      error:
        "Confirm needs the workbook on the stage — this stage has no source_file (pre-IG-14). Attach the file again.",
    }
  }
  const confirmed = await confirmProposedPublisherProfile({
    review: looked.staged.review,
    confirmedBy: args.confirmedBy,
    catalogue: args.catalogue,
    stageId: args.stageId,
  })
  if (!confirmed.ok) {
    return { ok: false, status: 409, error: confirmed.error }
  }
  const reparsed = await reparseStagedIngestFromSourceFile({
    stageId: args.stageId,
    profiles: [...args.profiles, confirmed.profile],
    pinnedPublisherName: confirmed.profile.publisher_name,
    lineAuditClient: args.lineAuditClient,
  })
  if (!reparsed.ok) {
    return reparsed
  }
  return {
    ok: true,
    status: 200,
    profile: confirmed.profile,
    review: reparsed.review,
  }
}
