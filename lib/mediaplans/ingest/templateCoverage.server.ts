/**
 * Server-only controlled-vocab resolution onto template coverage.
 * Never imported from Client Components.
 */
import "server-only"

import type { IngestProposal } from "@/lib/mediaplans/ingest/proposeLineItems"
import { resolveCatalogueIdForProfileName } from "@/lib/mediaplans/ingest/publisherCatalogueJoin"
import type { PublisherProfileConfig } from "@/lib/mediaplans/ingest/publisherProfileConfig"
import { resolveControlledValue } from "@/lib/mediaplans/ingest/resolveControlledValue"
import { getTargetTemplate } from "@/lib/mediaplans/ingest/targetTemplates"
import {
  applyCanonicalControlledValue,
  groupingKeysForControlledField,
  publisherRawFieldFor,
  uniqueGroupingRaws,
  type ResolvedControlledValue,
  type TemplateCoverage,
  type TemplateFieldCoverage,
  type UnresolvedControlledValue,
} from "@/lib/mediaplans/ingest/templateCoverage"

async function collectControlledResolutions(args: {
  mediaType: string
  profile: PublisherProfileConfig | null
  proposal: IngestProposal | null
  required: TemplateFieldCoverage[]
  enrich: TemplateFieldCoverage[]
}): Promise<{
  unresolved: UnresolvedControlledValue[]
  resolved: ResolvedControlledValue[]
}> {
  const template = getTargetTemplate(args.mediaType)
  const coverageById = new Map(
    [...args.required, ...args.enrich].map((f) => [f.id, f]),
  )
  const publisherName =
    args.profile?.publisher_name ?? args.proposal?.publisher_name ?? null
  const publisherId =
    args.profile?.publisher_id ??
    (publisherName ? resolveCatalogueIdForProfileName(publisherName) : null)
  const unresolved: UnresolvedControlledValue[] = []
  const resolved: ResolvedControlledValue[] = []

  for (const field of [...template.required, ...template.enrich]) {
    const vocabKey = field.controlled?.vocabulary
    if (!vocabKey) continue
    const coverageField = coverageById.get(field.id)
    if (!coverageField?.matched || coverageField.source.kind === "unmatched") {
      continue
    }
    for (const raw of uniqueGroupingRaws(
      args.proposal,
      groupingKeysForControlledField(field),
    )) {
      const resolution = await resolveControlledValue({
        vocabularyKey: vocabKey,
        raw,
        publisherId,
        publisherName,
      })
      if (resolution.canonical) {
        resolved.push({
          fieldId: field.id,
          raw,
          canonical: resolution.canonical,
          via: resolution.via ?? "exact",
        })
        continue
      }
      unresolved.push({
        fieldId: field.id,
        label: field.label,
        raw,
        vocabulary: vocabKey,
        suggestion: resolution.suggestion,
      })
    }
  }
  return { unresolved, resolved }
}

/**
 * Resolve controlled vocabularies (including publisher synonyms) onto coverage.
 * Auto-applied hits rewrite the proposal so stamp can stay synchronous.
 */
export async function attachControlledResolutions(args: {
  coverage: TemplateCoverage
  mediaType: string
  profile: PublisherProfileConfig | null
  proposal: IngestProposal | null
}): Promise<{
  coverage: TemplateCoverage
  proposal: IngestProposal | null
}> {
  const { unresolved, resolved } = await collectControlledResolutions({
    mediaType: args.mediaType,
    profile: args.profile,
    proposal: args.proposal,
    required: args.coverage.required,
    enrich: args.coverage.enrich,
  })
  const template = getTargetTemplate(args.mediaType)
  let proposal = args.proposal
  if (proposal) {
    for (const hit of resolved) {
      proposal = applyCanonicalControlledValue(proposal, {
        fieldId: hit.fieldId,
        raw: hit.raw,
        canonical: hit.canonical,
        publisherRawField: publisherRawFieldFor(template, hit.fieldId),
      })
    }
  }
  return {
    coverage: {
      ...args.coverage,
      unresolved_controlled: unresolved,
      resolved_controlled: resolved,
    },
    proposal,
  }
}
