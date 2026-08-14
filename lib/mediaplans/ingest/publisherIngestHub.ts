/**
 * Publisher Hub ingest payload: profile (if any) + recent ingest_runs.
 */

import { listPublisherProfiles } from "@/lib/mediaplans/ingest/loadPublisherProfiles"
import { findProfileForCataloguePublisher } from "@/lib/mediaplans/ingest/publisherCatalogueJoin"
import { listIngestRuns } from "@/lib/mediaplans/ingest/ingestRuns"
import type { PublisherProfileConfig } from "@/lib/mediaplans/ingest/publisherProfileConfig"
import type { IngestRunRecord } from "@/lib/mediaplans/ingest/ingestRuns"

export async function getPublisherIngestHub(catalogue: {
  id: number
  publisher_name: string
}): Promise<{
  profile: PublisherProfileConfig | null
  runs: IngestRunRecord[]
}> {
  const { profiles } = await listPublisherProfiles()
  const found = findProfileForCataloguePublisher(profiles, catalogue)
  const profile = found as PublisherProfileConfig | null
  const runs = await listIngestRuns({
    publisherId: catalogue.id,
    publisherName: profile?.publisher_name ?? catalogue.publisher_name,
    limit: 20,
  })
  return { profile, runs }
}
