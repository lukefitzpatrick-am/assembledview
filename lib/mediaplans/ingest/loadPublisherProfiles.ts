/**
 * Load publisher_profiles seed JSON (same payload as 0024).
 * Postgres listing lives in loadPublisherProfiles.server.ts.
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import {
  parsePublisherProfile,
  type PublisherProfileConfig,
} from "@/lib/mediaplans/ingest/publisherProfileConfig"

const SEED_PATH = path.join(
  process.cwd(),
  "lib/mediaplans/ingest/seeds/publisherProfiles.json",
)

export function loadSeedPublisherProfiles(): PublisherProfileConfig[] {
  const raw = JSON.parse(readFileSync(SEED_PATH, "utf8")) as unknown[]
  return raw.map((row) => parsePublisherProfile(row))
}
