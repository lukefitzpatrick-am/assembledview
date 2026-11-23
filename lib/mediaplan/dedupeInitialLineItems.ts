type Item = Record<string, unknown>

/** The fields a channel's load de-dupe compares: an id-less line's, and the whole load's. */
export type LoadDedupeKeys = {
  /** Unset: no line is dropped; only a reload with the same load key is skipped (Television). */
  fallbackKey?: (item: Item) => Record<string, unknown>
  loadKey: (item: Item) => Record<string, unknown>
}

/** Integration's keys (W5b): platform, objective, campaign, buy type and targeting. */
export const INTEGRATION_LOAD_DEDUPE: LoadDedupeKeys = {
  fallbackKey: (item) => ({
    platform: item?.platform ?? "",
    objective: item?.objective ?? "",
    campaign: item?.campaign ?? "",
    buy_type: item?.buy_type ?? item?.buyType ?? "",
    targeting_attribute: item?.targeting_attribute ?? item?.targetingAttribute ?? "",
  }),
  loadKey: (item) => ({
    id: item.id,
    platform: item.platform,
    objective: item.objective,
    campaign: item.campaign,
    buy_type: item.buy_type,
  }),
}

/** Radio's keys (W5g, moved from its container): market, network, station, buy type and placement. */
export const RADIO_LOAD_DEDUPE: LoadDedupeKeys = {
  fallbackKey: (item) => ({
    market: item?.market ?? "",
    network: item?.network ?? item?.platform ?? item?.publisher ?? "",
    station: item?.station ?? item?.site ?? "",
    buy_type: item?.buy_type ?? item?.buyType ?? "",
    placement: item?.placement ?? "",
  }),
  loadKey: (item) => ({
    id: item.id,
    market: item.market,
    network: item.network,
    station: item.station,
    buy_type: item.buy_type,
  }),
}

/**
 * Integration's (W5b) and Radio's (W5g) load de-dupe, moved unchanged from
 * their old bespoke containers and run by `useMediaChannelContainer` with the
 * keys the config's `dedupeOnLoad` names.
 *
 * A repeated line id (or `id`) keeps its first line. A line with no id is a
 * repeat when the channel's fallback fields match an earlier one. Live (Nov
 * 2026): no saved version repeats a line id.
 */
export function dedupeInitialLineItems<T extends Item>(
  items: T[],
  tag: string,
  keys: LoadDedupeKeys,
): T[] {
  const { fallbackKey } = keys
  if (!fallbackKey) return items
  const seen = new Set<string>()
  const deduped: T[] = []

  for (const item of items) {
    const primaryKey = (item?.line_item_id || item?.lineItemId || item?.id) ?? ""

    if (primaryKey && String(primaryKey).trim()) {
      const key = `id:${String(primaryKey).trim()}`
      if (seen.has(key)) continue
      seen.add(key)
      deduped.push(item)
      continue
    }

    const key = `fallback:${JSON.stringify(fallbackKey(item))}`
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(item)
  }

  if (deduped.length !== items.length) {
    console.warn(`[${tag}] Deduped initialLineItems from ${items.length} to ${deduped.length}`)
  }

  return deduped
}

/**
 * The identity of a load: a later load with the same key is skipped, so the
 * form keeps its edits (Integration's and Radio's guard, kept as they were).
 * shortcut: the key ignores budgets and dates, so a reload that changes only
 * money is not shown; upgrade when Luke rules it should hydrate like every
 * other channel (W5b question).
 */
export function initialLinesLoadKey(items: Item[], keys: LoadDedupeKeys): string {
  return JSON.stringify(items.map(keys.loadKey))
}
