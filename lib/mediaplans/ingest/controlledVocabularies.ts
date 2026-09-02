/**
 * Channel-owned controlled vocabularies for ingest value cards.
 * Option lists and matchers live in lib — never copied here, never forked.
 */

import {
  exactCanonicalBuyType,
  exactCanonicalFormat,
  fuzzyMatchBuyType,
  fuzzyMatchFormat,
  OOH_BUY_TYPE_LABEL_BY_VALUE,
  OOH_BUY_TYPE_OPTIONS,
  OOH_FORMAT_LABEL_BY_VALUE,
  OOH_FORMAT_OPTIONS,
} from "@/lib/mediaplan/expertOohFuzzyMatch"

export type ControlledVocabulary = {
  key: string
  label: string
  values: readonly string[]
  labelByValue: Record<string, string>
  exact: (input: string) => string | null
  fuzzy: (input: string) => string | null
}

/** Ingest-only: "JCDecaux DIGITAL LARGE FORMAT" → "DIGITAL LARGE FORMAT". */
export function stripPublisherPrefix(
  raw: string,
  publisherName?: string | null,
): string {
  const trimmed = raw.trim()
  const pub = publisherName?.trim()
  if (!pub) return trimmed
  if (!trimmed.toLowerCase().startsWith(pub.toLowerCase())) return trimmed
  const rest = trimmed.slice(pub.length).replace(/^[\s\-–—:]+/, "").trim()
  return rest || trimmed
}

const OOH_FORMAT: ControlledVocabulary = {
  key: "ooh_format",
  label: "format",
  values: OOH_FORMAT_OPTIONS,
  labelByValue: OOH_FORMAT_LABEL_BY_VALUE,
  exact: exactCanonicalFormat,
  fuzzy: (input) => fuzzyMatchFormat(input)?.matched ?? null,
}

const OOH_BUY_TYPE: ControlledVocabulary = {
  key: "ooh_buy_type",
  label: "buy type",
  values: OOH_BUY_TYPE_OPTIONS,
  labelByValue: OOH_BUY_TYPE_LABEL_BY_VALUE,
  exact: exactCanonicalBuyType,
  fuzzy: (input) => fuzzyMatchBuyType(input)?.matched ?? null,
}

const REGISTRY: Record<string, ControlledVocabulary> = {
  ooh_format: OOH_FORMAT,
  ooh_buy_type: OOH_BUY_TYPE,
}

export function getControlledVocabulary(
  key: string,
): ControlledVocabulary | null {
  return REGISTRY[key] ?? null
}

export function listControlledVocabularyKeys(): string[] {
  return Object.keys(REGISTRY)
}

/** Labels in vocabulary order, "Other" last — same surface as the editor combobox. */
export function choiceLabelsForVocabulary(
  vocab: ControlledVocabulary,
): string[] {
  const labels = vocab.values.map((value) => vocab.labelByValue[value] ?? value)
  return [
    ...labels.filter((label) => label !== "Other"),
    ...labels.filter((label) => label === "Other"),
  ]
}
