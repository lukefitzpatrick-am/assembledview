/**
 * MB-30 (B20): union of a month's existing billing rows for one media key
 * with rows generated from the containers. Used by the edit page's
 * `attachLineItemsToMonths` and `handleManualBillingOpen`, so a ghost can't
 * enter working billing through the append template or the MBA billing modal
 * and Apply.
 *
 * Same match order as the lib merge (`appendMissingLineItemsOnly`):
 * 1. canonical id (bare ↔ `billing-<media>::`): the generated row is already there;
 * 2. old-id alias (`billingLineIdAlias`), one to one, existing rows no
 *    generated row matched by id: the existing row takes the generated id
 *    and keeps its own amounts and mode (a copy; the input is not mutated);
 * 3. a placeholder `new-N` generated row is skipped when the bucket already
 *    has rows (reported);
 * 4. else the generated row is new and is added after the existing rows.
 * An empty or missing bucket takes the generated list as is, as before.
 */

import type { BillingAliasAdoption, BillingPlaceholderSkip } from "@/lib/billing/appendAutoReferenceIntoWorking"
import { billingLineAliasKey } from "@/lib/billing/billingLineIdAlias"
import { isPlaceholderBillingLineId } from "@/lib/billing/rekeyManualBillingForMba"
import type { BillingLineItem } from "@/lib/billing/types"
import { billingOverrideLineIdsMatch } from "@/lib/finance/manualBillingOverridesUi"

export type UnionGeneratedBillingLinesResult<T extends BillingLineItem> = {
  list: T[]
  /** False when the existing list is returned unchanged (same array). */
  changed: boolean
  aliasAdoptions: BillingAliasAdoption[]
  placeholderSkips: BillingPlaceholderSkip[]
}

export function unionGeneratedBillingLines<T extends BillingLineItem>(
  existing: T[] | null | undefined,
  generated: T[],
  opts: { mediaKey: string; mbaNumber?: string | null }
): UnionGeneratedBillingLinesResult<T> {
  if (!existing || existing.length === 0) {
    return { list: generated, changed: true, aliasAdoptions: [], placeholderSkips: [] }
  }
  const mediaKey = String(opts.mediaKey ?? "").trim()
  const mbaNumber = String(opts.mbaNumber ?? "").trim()
  const aliasOf = (id: unknown) =>
    mbaNumber && mediaKey ? billingLineAliasKey({ id, mediaKey, mbaNumber }) : null

  const list: T[] = [...existing]
  const claimed = new Set<number>()
  list.forEach((ex, index) => {
    if (generated.some((g) => billingOverrideLineIdsMatch(String(ex.id ?? ""), String(g.id ?? "").trim()))) {
      claimed.add(index)
    }
  })

  const added: T[] = []
  const aliasAdoptions: BillingAliasAdoption[] = []
  const placeholderSkips: BillingPlaceholderSkip[] = []
  let changed = false

  for (const g of generated) {
    const gid = String(g.id ?? "").trim()
    if (!gid) continue
    if (list.some((ex) => billingOverrideLineIdsMatch(String(ex.id ?? ""), gid))) continue
    const gAlias = aliasOf(gid)
    if (gAlias) {
      const index = list.findIndex((ex, i) => !claimed.has(i) && aliasOf(ex.id) === gAlias)
      if (index >= 0) {
        const fromId = String(list[index]!.id ?? "")
        list[index] = { ...list[index]!, id: g.id }
        claimed.add(index)
        aliasAdoptions.push({ fromId, toId: gid })
        changed = true
        continue
      }
    }
    if (isPlaceholderBillingLineId(gid)) {
      placeholderSkips.push({ id: gid })
      continue
    }
    added.push(g)
    changed = true
  }

  if (!changed) {
    return { list: existing, changed: false, aliasAdoptions, placeholderSkips }
  }
  return { list: [...list, ...added], changed: true, aliasAdoptions, placeholderSkips }
}
