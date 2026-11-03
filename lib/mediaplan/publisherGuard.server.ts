/**
 * Server half of the B19 publisher guard (decision Q4). The save route calls
 * it after the buy type and burst date gates. The rules live in
 * `lib/mediaplan/publisherGuard.ts`; this reads the switch and a fresh
 * publisher list (not the 10 minute list cache, so a publisher an admin has
 * just added counts at once).
 */
import "server-only"

import { getDb, schema } from "@/db"
import { isFeatureOn } from "@/lib/features/server"
import {
  publisherGuardGateResult,
  shouldRunPublisherGuard,
  type PublisherGuardFinding,
  type PublisherGuardLine,
  type PublisherGuardRejectBody,
} from "@/lib/mediaplan/publisherGuard"
import type { PublisherIdentityRow } from "@/lib/publisher/publisherUniqueness"

async function loadPublisherIdentityRows(): Promise<PublisherIdentityRow[]> {
  return getDb()
    .select({
      id: schema.publishers.id,
      publisher_name: schema.publishers.publisherName,
      publisherid: schema.publishers.publisherid,
    })
    .from(schema.publishers)
}

export type PublisherGuardDeps = {
  isOn: () => Promise<boolean>
  loadPublishers: () => Promise<PublisherIdentityRow[]>
}

const defaultDeps: PublisherGuardDeps = {
  isOn: () => isFeatureOn("publisher_guard"),
  loadPublishers: loadPublisherIdentityRows,
}

/**
 * Off, or not a publish: `{ reject: false, warnings: [] }` without reading
 * publishers. A failed read lets the save through (logged): the guard
 * catches typing mistakes, it must not block saves when the read fails.
 */
export async function publisherGuardForSave(
  mode: "draft" | "new_version" | "publish",
  lineItems: readonly PublisherGuardLine[],
  deps: PublisherGuardDeps = defaultDeps,
): Promise<
  | { reject: false; warnings: PublisherGuardFinding[] }
  | { reject: true; body: PublisherGuardRejectBody }
> {
  if (mode !== "publish") return { reject: false, warnings: [] }
  let enabled = false
  try {
    enabled = await deps.isOn()
  } catch (err) {
    console.warn("[plans/save] publisher guard switch read failed; guard off", err)
  }
  if (!shouldRunPublisherGuard(mode, enabled)) return { reject: false, warnings: [] }
  let publishers: PublisherIdentityRow[]
  try {
    publishers = await deps.loadPublishers()
  } catch (err) {
    console.error("[plans/save] publisher guard could not read publishers; save not checked", err)
    return { reject: false, warnings: [] }
  }
  return publisherGuardGateResult({ mode, enabled, lineItems, publishers })
}
