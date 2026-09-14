/**
 * Shared remap entry used by schedule review and the Publisher Hub.
 * Keyed by publisher_name while 1:1 holds.
 */

import { persistColumnRemap } from "@/lib/mediaplans/ingest/persistColumnRemap.server"
import type {
  RemapRejection,
  RemapResult,
  RemapSource,
} from "@/lib/mediaplans/ingest/persistColumnRemap"

export async function remapIngestColumn(args: {
  publisherName: string
  header: string
  mappedTo: string | null
  knownHeaders: string[]
  changedBy: string
  source: RemapSource
  stageId?: string | null
}): Promise<RemapResult | RemapRejection> {
  return persistColumnRemap(args)
}
