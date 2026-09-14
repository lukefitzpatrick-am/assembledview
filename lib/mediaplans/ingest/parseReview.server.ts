/**
 * Server-only Parse Review persist (synonym learn + column remap).
 * Never imported from Client Components.
 */
import "server-only"

import type { IngestReviewPackage } from "@/lib/mediaplans/ingest/buildIngestReview"
import { getControlledVocabulary } from "@/lib/mediaplans/ingest/controlledVocabularies"
import {
  applyControlledValueToReview,
  parseReviewOf,
  siblingRowsForValue,
  unresolvedValuesForRow,
} from "@/lib/mediaplans/ingest/parseReview"
import { knownHeadersFromReview } from "@/lib/mediaplans/ingest/persistColumnRemap"
import { resolveCatalogueIdForProfileName } from "@/lib/mediaplans/ingest/publisherCatalogueJoin"
import { remapIngestColumn } from "@/lib/mediaplans/ingest/remapIngestColumn"
import { learnSynonym } from "@/lib/mediaplans/ingest/valueSynonymRepo.server"

function headerKey(h: string): string {
  return h.replace(/\s+/g, " ").trim().toLowerCase()
}

export async function resolveParseReviewValue(args: {
  review: IngestReviewPackage
  row: number
  answer: string
  by: string
  stageId: string
}): Promise<{
  review: IngestReviewPackage
  resolvedRows: number[]
  canonical: string
  synonymWritten: boolean
}> {
  const unresolved = unresolvedValuesForRow(args.review, args.row)[0]
  if (!unresolved) {
    return {
      review: args.review,
      resolvedRows: [],
      canonical: "",
      synonymWritten: false,
    }
  }
  const vocab = getControlledVocabulary(unresolved.vocabulary)
  const chosen = args.answer.trim()
  const canonical =
    (vocab ? vocab.exact(chosen) ?? vocab.fuzzy(chosen) : null) ?? ""
  if (!canonical || !vocab) {
    return {
      review: args.review,
      resolvedRows: [],
      canonical: "",
      synonymWritten: false,
    }
  }
  const siblings = siblingRowsForValue(args.review, unresolved)
  const next = applyControlledValueToReview(args.review, unresolved, canonical)
  const publisherName =
    next.proposal?.publisher_name ?? next.detected_publisher ?? null
  const publisherId =
    next.profile?.publisher_id ??
    (publisherName ? resolveCatalogueIdForProfileName(publisherName) : null)
  let synonymWritten = false
  if (publisherId != null) {
    await learnSynonym({
      publisherId,
      mediaType:
        next.template_coverage?.media_type ??
        next.detected_media_type ??
        "ooh",
      vocabulary: unresolved.vocabulary,
      avField: unresolved.fieldId,
      rawValue: unresolved.raw,
      rawValueDisplay: unresolved.raw,
      avCanonical: canonical,
      learnedFromStageId: args.stageId,
      createdBy: args.by,
    })
    synonymWritten = true
  }
  return { review: next, resolvedRows: siblings, canonical, synonymWritten }
}

export async function applyParseReviewOverrideProposal(args: {
  review: IngestReviewPackage
  header: string
  mappedTo: string
  by: string
  stageId: string
}): Promise<{
  review: IngestReviewPackage
  applied: boolean
  reason?: string
}> {
  const state = parseReviewOf(args.review)
  const proposal = (state.override_proposals ?? []).find(
    (p) =>
      headerKey(p.header) === headerKey(args.header) &&
      headerKey(p.mapped_to) === headerKey(args.mappedTo) &&
      !p.applied,
  )
  if (!proposal) {
    return {
      review: args.review,
      applied: false,
      reason: "No pending override proposal for that mapping.",
    }
  }
  const publisherName =
    proposal.publisher_name ||
    args.review.detected_publisher ||
    args.review.proposal?.publisher_name ||
    ""
  const result = await remapIngestColumn({
    publisherName,
    header: proposal.header,
    mappedTo: proposal.mapped_to,
    knownHeaders: knownHeadersFromReview(args.review),
    changedBy: args.by,
    source: "parse_review",
    stageId: args.stageId,
  })
  if (!result.ok) {
    return { review: args.review, applied: false, reason: result.reason }
  }
  return {
    review: {
      ...args.review,
      parse_review: {
        ...state,
        override_proposals: (state.override_proposals ?? []).map((p) =>
          p === proposal ? { ...p, applied: true } : p,
        ),
      },
    },
    applied: true,
  }
}
