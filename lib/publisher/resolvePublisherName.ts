/**
 * One publisher-name resolver for Advertising Associates routing (FB-9).
 *
 * Used by the AA media plan workbook and filter, the AA billing cycle, the
 * finance G./D. production split (hub Excel, Send to accounts, Clients
 * billing review download) and the editor "Why isn't this on the AA plan?"
 * control, so they all agree on which publisher a typed name means.
 *
 * Order, all keys trimmed and case-insensitive:
 * 1. `publishers.publisher_name` (lowest `publishers.id` when a name is
 *    shared, via `resolvePublisherNameGroup`; never last-wins)
 * 2. a read-time alias (`PUBLISHER_NAME_ALIASES`) to a canonical name
 * 3. `publishers.publisherid` (an id shared by two publishers never matches)
 *
 * Pure: no DB, no server-only.
 */

import {
  publisherIdentityKey,
  resolvePublisherNameGroup,
  sortPublishersByRowId,
  type PublisherIdentityRow,
} from "@/lib/publisher/publisherUniqueness"

/**
 * Free-text production publisher names typed before the publisher picker,
 * mapped to the canonical `publishers.publisher_name`.
 *
 * Read-time only. Published versions are immutable (`assertVersionMutable`,
 * VERSION_PUBLISHED_IMMUTABLE; their `approved_slice` and snapshot checksum
 * are frozen), so the stored line text is never rewritten. Keys are
 * lower-case trimmed. A real publisher with the typed name always wins over
 * the alias. Luke approved SCA and NOVA on 26 Oct 2026 (FB-9), then Go
 * Transit and Vicinity Group the same evening (20:33): both are the same
 * business as an existing publisher, so no second publisher is created.
 * "GoTranist" (#77) is the stored name, misspelt; TheY001 media lines use it.
 * Add others only on his say-so.
 */
export const PUBLISHER_NAME_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  sca: "Southern Cross Austereo",
  nova: "Nova",
  "go transit": "GoTranist",
  "vicinity group": "Vicinity",
})

export type PublisherMatchedBy = "name" | "alias" | "publisherid"

export type PublisherNameIndex<T extends PublisherIdentityRow> = {
  /** Lower-case trimmed name to every publisher with it, lowest id first. */
  byName: Map<string, T[]>
  /** Lower-case trimmed publisherid to publisher. Shared ids are left out. */
  byId: Map<string, T>
}

export function buildPublisherNameIndex<T extends PublisherIdentityRow>(
  publishers: readonly T[],
): PublisherNameIndex<T> {
  const byName = new Map<string, T[]>()
  const byId = new Map<string, T>()
  const ambiguousIds = new Set<string>()
  for (const p of sortPublishersByRowId(publishers)) {
    const name = publisherIdentityKey(p.publisher_name)
    if (name) {
      const list = byName.get(name)
      if (list) list.push(p)
      else byName.set(name, [p])
    }
    const id = publisherIdentityKey(p.publisherid)
    if (!id) continue
    if (byId.has(id) || ambiguousIds.has(id)) {
      byId.delete(id)
      ambiguousIds.add(id)
      continue
    }
    byId.set(id, p)
  }
  return { byName, byId }
}

export type PublisherNameMatch<T extends PublisherIdentityRow> = {
  publisher: T
  matchedBy: PublisherMatchedBy
}

/** The publisher a typed name means, and how it matched. Undefined when none. */
export function resolvePublisherNameMatch<T extends PublisherIdentityRow>(
  name: unknown,
  index: PublisherNameIndex<T>,
): PublisherNameMatch<T> | undefined {
  const raw = String(name ?? "").trim()
  const key = publisherIdentityKey(raw)
  if (!key) return undefined
  const byName = resolvePublisherNameGroup(raw, index.byName.get(key))
  if (byName) return { publisher: byName, matchedBy: "name" }
  const alias = PUBLISHER_NAME_ALIASES[key]
  if (alias) {
    const aliased = resolvePublisherNameGroup(alias, index.byName.get(publisherIdentityKey(alias)))
    if (aliased) return { publisher: aliased, matchedBy: "alias" }
  }
  const byId = index.byId.get(key)
  return byId ? { publisher: byId, matchedBy: "publisherid" } : undefined
}

export function resolvePublisherName<T extends PublisherIdentityRow>(
  name: unknown,
  index: PublisherNameIndex<T>,
): T | undefined {
  return resolvePublisherNameMatch(name, index)?.publisher
}

/** Name to publisher lookup over one publisher list (index built once). */
export function createPublisherNameResolver<T extends PublisherIdentityRow>(
  publishers: readonly T[],
): (name: unknown) => T | undefined {
  const index = buildPublisherNameIndex(publishers)
  return (name: unknown) => resolvePublisherName(name, index)
}

/** True when the publisher's billing agency is Advertising Associates. */
export function publisherBillsViaAdvertisingAssociates(
  p: Pick<PublisherIdentityRow, "billingagency"> | null | undefined,
): boolean {
  return String(p?.billingagency ?? "").trim().toLowerCase() === "advertising associates"
}

/** Typed name to "bills via AA", for the finance production split. */
export function createBillsViaAdvertisingAssociates(
  publishers: readonly PublisherIdentityRow[],
): (name: string) => boolean {
  const resolve = createPublisherNameResolver(publishers)
  return (name: string) => publisherBillsViaAdvertisingAssociates(resolve(name))
}
