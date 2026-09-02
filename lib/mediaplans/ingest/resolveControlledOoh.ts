/**
 * Route publisher prose through the existing OOH matcher before it reaches
 * a controlled card field. Do not fork Fuse or the option lists.
 *
 * @deprecated Use resolveControlledValue — this wrapper is exact/fuzzy/prefix
 * only (no synonym store) so stamp and hydrate stay synchronous.
 */

import {
  choiceLabelsForVocabulary,
  getControlledVocabulary,
  stripPublisherPrefix,
} from "@/lib/mediaplans/ingest/controlledVocabularies"

function matchVocab(
  key: "ooh_format" | "ooh_buy_type",
  input: string,
): string | null {
  const vocab = getControlledVocabulary(key)
  if (!vocab) return null
  return vocab.exact(input) ?? vocab.fuzzy(input)
}

/** Canonical AV format, or null when Fuse score > 0.6 (or empty). */
export function resolveControlledFormat(
  raw: string,
  publisherName?: string,
): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const direct = matchVocab("ooh_format", trimmed)
  if (direct) return direct
  const stripped = stripPublisherPrefix(trimmed, publisherName)
  if (stripped !== trimmed) return matchVocab("ooh_format", stripped)
  return null
}

/** Canonical AV buy type, or null when Fuse score > 0.6 (or empty). */
export function resolveControlledBuyType(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  return matchVocab("ooh_buy_type", trimmed)
}

/** AV format labels for value cards. Other last; source order is not changed. */
export function oohFormatChoiceLabels(): string[] {
  const vocab = getControlledVocabulary("ooh_format")
  if (!vocab) return []
  return choiceLabelsForVocabulary(vocab)
}
