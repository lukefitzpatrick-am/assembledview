/**
 * Publisher Hub ingest payload: profile + recent ingest_runs + latest eval score.
 */

import { listPublisherProfiles } from "@/lib/mediaplans/ingest/loadPublisherProfiles.server"
import { findProfileForCataloguePublisher } from "@/lib/mediaplans/ingest/publisherCatalogueJoin"
import { listIngestRuns } from "@/lib/mediaplans/ingest/ingestRuns"
import type { IngestRunRecord } from "@/lib/mediaplans/ingest/ingestRuns"
import {
  listLatestIngestEvalRun,
  type IngestEvalRunRecord,
} from "@/lib/mediaplans/ingest/ingestEvalRuns"
import type { PublisherProfileConfig } from "@/lib/mediaplans/ingest/publisherProfileConfig"

export async function getPublisherIngestHub(catalogue: {
  id: number
  publisher_name: string
}): Promise<{
  profile: PublisherProfileConfig | null
  runs: IngestRunRecord[]
  latestEval: IngestEvalRunRecord | null
}> {
  const { profiles } = await listPublisherProfiles()
  const found = findProfileForCataloguePublisher(profiles, catalogue)
  const profile = found as PublisherProfileConfig | null
  const runs = await listIngestRuns({
    publisherId: catalogue.id,
    publisherName: profile?.publisher_name ?? catalogue.publisher_name,
    limit: 20,
  })
  const latestEval = await listLatestIngestEvalRun({
    publisherId: catalogue.id,
    publisherName: profile?.publisher_name ?? catalogue.publisher_name,
  })
  return { profile, runs, latestEval }
}
