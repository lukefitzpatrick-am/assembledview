/**
 * Field-agnostic controlled-value resolution.
 * Synonyms are loaded here (async). Stamp stays synchronous by reading
 * TemplateCoverage.resolved_controlled written at review-build.
 */

import {
  getControlledVocabulary,
  stripPublisherPrefix,
} from "@/lib/mediaplans/ingest/controlledVocabularies"
import { listSynonymsFor } from "@/lib/mediaplans/ingest/valueSynonymRepo"

export type ControlledResolution = {
  canonical: string | null
  via: "exact" | "publisher_synonym" | "global_synonym" | "fuzzy" | "prefix_strip" | null
  /** Set when a global synonym matched — offered, never auto-applied. */
  suggestion: string | null
}

export function normaliseSynonymRaw(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().toLowerCase()
}

function matchVocab(
  vocab: { exact: (s: string) => string | null; fuzzy: (s: string) => string | null },
  input: string,
): string | null {
  return vocab.exact(input) ?? vocab.fuzzy(input)
}

export async function resolveControlledValue(args: {
  vocabularyKey: string
  raw: string
  publisherId: number | null
  publisherName?: string | null
}): Promise<ControlledResolution> {
  const trimmed = args.raw.trim()
  if (!trimmed) {
    return { canonical: null, via: null, suggestion: null }
  }
  const vocab = getControlledVocabulary(args.vocabularyKey)
  if (!vocab) {
    return { canonical: null, via: null, suggestion: null }
  }

  const exact = vocab.exact(trimmed)
  if (exact) {
    return { canonical: exact, via: "exact", suggestion: null }
  }

  const synonyms = await listSynonymsFor({
    vocabulary: args.vocabularyKey,
    publisherId: args.publisherId,
  })
  const rawKey = normaliseSynonymRaw(trimmed)

  const publisherHit = synonyms.find(
    (row) => row.scope === "publisher" && row.rawValue === rawKey,
  )
  if (publisherHit) {
    return {
      canonical: publisherHit.avCanonical,
      via: "publisher_synonym",
      suggestion: null,
    }
  }

  const globalHit = synonyms.find(
    (row) => row.scope === "global" && row.rawValue === rawKey,
  )
  if (globalHit) {
    return {
      canonical: null,
      via: "global_synonym",
      suggestion: globalHit.avCanonical,
    }
  }

  const fuzzy = vocab.fuzzy(trimmed)
  if (fuzzy) {
    return { canonical: fuzzy, via: "fuzzy", suggestion: null }
  }

  const stripped = stripPublisherPrefix(trimmed, args.publisherName)
  if (stripped !== trimmed) {
    const afterStrip = matchVocab(vocab, stripped)
    if (afterStrip) {
      return { canonical: afterStrip, via: "prefix_strip", suggestion: null }
    }
  }

  return { canonical: null, via: null, suggestion: null }
}
