/**
 * Integration's load de-dupe, moved unchanged from the old bespoke container
 * (W5b) and run by `useMediaChannelContainer` when the config sets
 * `dedupeOnLoad`.
 *
 * A repeated line id (or `id`) keeps its first line. A line with no id is a
 * repeat when platform, objective, campaign, buy type and targeting match an
 * earlier one. Live (Nov 2026): no saved version repeats a line id.
 */
export function dedupeInitialLineItems<T extends Record<string, unknown>>(items: T[], tag: string): T[] {
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

    const fallbackKey = JSON.stringify({
      platform: item?.platform ?? "",
      objective: item?.objective ?? "",
      campaign: item?.campaign ?? "",
      buy_type: item?.buy_type ?? item?.buyType ?? "",
      targeting_attribute: item?.targeting_attribute ?? item?.targetingAttribute ?? "",
    })
    const key = `fallback:${fallbackKey}`
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
 * form keeps its edits (Integration's guard, kept as it was).
 * shortcut: the key ignores budgets and dates, so a reload that changes only
 * money is not shown; upgrade when Luke rules it should hydrate like every
 * other channel (W5b question).
 */
export function initialLinesLoadKey(items: Record<string, unknown>[]): string {
  return JSON.stringify(
    items.map((item) => ({
      id: item.id,
      platform: item.platform,
      objective: item.objective,
      campaign: item.campaign,
      buy_type: item.buy_type,
    })),
  )
}
