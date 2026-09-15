import { PartnerIngestError } from "../errors"
import type { ParsedPartnerFile } from "../types"

import { parsePartnerFileMatrix } from "./parseChannelFactory"
import { parseVistarMatrix } from "./parseVistar"

export { rawLinesFromMatrix, readPartnerFileMatrix } from "./shared"

export type PartnerFileParser = (matrix: unknown[][]) => ParsedPartnerFile

const PARSERS: Record<string, PartnerFileParser> = {
  "channel-factory": parsePartnerFileMatrix,
  vistar: parseVistarMatrix,
}

/** Keyed by PARTNER_SOURCE_MAP.SOURCE_SLUG. Unknown slugs are unrecognised mail. */
export function parserForSource(sourceSlug: string): PartnerFileParser {
  const parser = PARSERS[sourceSlug]
  if (!parser) {
    throw new PartnerIngestError(`no parser for source ${JSON.stringify(sourceSlug)}`)
  }
  return parser
}
