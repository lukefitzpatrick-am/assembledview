/**
 * MB-33 (B21): match an old partial MBA selection to the editor's current line ids.
 *
 * Old partial MBAs (`mba_scope` null) keep their selection in the saved billing
 * schedule's `partialApproval.channels`, with the line ids of the day. The
 * editor rebuilds every line id when it loads a plan (`assignStableLineItemNumbers`,
 * MB-34), so `PGAAUS010ML1` shows as `PGAAUS010DD1` and `PGAAUS0051` as
 * `PGAAUS005SM1`. Compared as saved, those lines load excluded (PGAAUS010 v4
 * digital display, PGAAUS005 v3 social).
 *
 * Per listed channel, in this order:
 * 1. Exact id (bare, `billing-<media>::` stripped).
 * 2. Old-id alias (`billingLineIdAlias`), one to one only: one saved id and one
 *    unclaimed current id share the alias key. Only for id shapes whose line
 *    number the editor keeps (current code, `ML`). A no-code or old production
 *    id takes its current number from the line's saved position, so its number
 *    can point at another line (B20 review finding 3). Those never pair here.
 *    With the loaded lines given, the pair also needs exactly one loaded line
 *    to ask for that number, and that line's own id (current code or `ML`) to
 *    carry it. Otherwise the editor renumbered one of them and the current id
 *    may be another line (B21fix, review finding 2: `[DD1, ML1]` loads as
 *    `DD1, DD2`, and a saved `ML1` would take the new `DD1`).
 * 3. A channel saved with every line selected (`selectedCount === totalCount`)
 *    that still has unmatched ids and the same number of lines today selects
 *    every current line of the channel (decision Q9). When every saved id
 *    matched, lines added since stay out, as for any managed channel.
 * Anything left is unresolved: it stays excluded and is reported so the page
 * can warn (decision Q8).
 *
 * A listed channel with no current lines keeps its saved ids and is reported.
 * A current channel the saved selection doesn't list was added after the
 * partial MBA was set. It loads approved (decision Q10), so its current ids
 * join the selection and a save keeps them (B21fix, decision B21 R1). It is
 * reported too.
 *
 * Pure. Never writes.
 */

import { billingLineIdAlias, type BillingLineIdAlias } from "@/lib/billing/billingLineIdAlias"
import {
  buildCanonicalBillingLineIdSet,
  canonicalBillingLineIdSetHas,
  toBillingOverrideLineItemId,
} from "@/lib/finance/manualBillingOverridesUi"
import { editorClaimedLineNumber, type LineItemWithIdentity } from "@/lib/mediaplan/lineItemOrder"

export type LegacyPartialChannel = {
  mediaKey: string
  selectedLineItemIds?: readonly string[] | null
  selectedCount?: number | null
  totalCount?: number | null
}

/** Loaded lines (`line_item_id`, `line_item`) by billing media key. */
export type LegacyPartialLoadedLines = Readonly<Record<string, readonly LineItemWithIdentity[]>>

export type ReconcileLegacyPartialInput = {
  channels: readonly LegacyPartialChannel[]
  /** Editor ids by billing media key (`editorBillingStableLineItemId`, bare or decorated), in editor order. */
  editorIdsByMedia: Readonly<Record<string, readonly string[]>>
  /**
   * The lines as loaded, before the editor renumbers them (`line_item_id` and
   * `line_item`), by billing media key. Used to refuse an alias pair the
   * editor's renumbering makes unsafe. A channel without loaded lines skips
   * that check.
   */
  loadedLinesByMedia?: LegacyPartialLoadedLines
  mbaNumber: string | null | undefined
}

export type LegacyPartialAliasMatch = {
  mediaKey: string
  savedId: string
  editorId: string
}

export type LegacyPartialUnresolvedReason =
  /** No current id and no alias. */
  | "no_match"
  /**
   * Alias key shared by more than one saved id or more than one current id, or
   * the loaded lines don't show which line holds that number now.
   */
  | "ambiguous"
  /** No-code or old production id: the editor renumbers these from position. */
  | "line_number_not_kept"

export type LegacyPartialUnresolved = {
  mediaKey: string
  savedId: string
  reason: LegacyPartialUnresolvedReason
}

export type ReconcileLegacyPartialResult = {
  /** Bare ids by media key, for every listed and every later-added channel. Feed to `partialMBASelectedLineItemIds`. */
  selected: Record<string, string[]>
  /** True when `selected` differs from the saved ids as stripped today. */
  changed: boolean
  aliasMatches: LegacyPartialAliasMatch[]
  /** Channels filled from every current line (rule 3). */
  expandedMediaKeys: string[]
  unresolved: LegacyPartialUnresolved[]
  /** Listed channels with no current lines. */
  missingMediaKeys: string[]
  /** Current channels the saved selection doesn't list. Every current id is in `selected`. */
  laterAddedMediaKeys: string[]
  /** Current ids of each listed channel that are not in `selected` (channels with none left out are omitted). */
  leftOutByMedia: Record<string, string[]>
}

function bareUnique(ids: readonly string[] | null | undefined): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of ids ?? []) {
    const id = toBillingOverrideLineItemId(String(raw ?? "").trim())
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  const s = new Set(a)
  return b.every((x) => s.has(x))
}

/**
 * True when the current line with this alias number is the line whose loaded
 * id carries it: exactly one loaded line asks for the number, and its id is a
 * current-code or `ML` id with the same alias key.
 */
function loadedLineHoldsAliasNumber(
  loaded: readonly LineItemWithIdentity[],
  alias: BillingLineIdAlias,
  mediaKey: string,
  mbaNumber: string | null | undefined
): boolean {
  const claimers = loaded.filter((line) => editorClaimedLineNumber(line) === alias.lineNumber)
  if (claimers.length !== 1) return false
  const own = billingLineIdAlias({
    id: claimers[0]!.line_item_id ?? claimers[0]!.lineItemId,
    mediaKey,
    mbaNumber,
  })
  return own != null && own.key === alias.key && (own.form === "current" || own.form === "ml")
}

export function reconcileLegacyPartialSelection(
  input: ReconcileLegacyPartialInput
): ReconcileLegacyPartialResult {
  const selected: Record<string, string[]> = {}
  const aliasMatches: LegacyPartialAliasMatch[] = []
  const expandedMediaKeys: string[] = []
  const unresolved: LegacyPartialUnresolved[] = []
  const missingMediaKeys: string[] = []
  const leftOutByMedia: Record<string, string[]> = {}
  let changed = false

  const listed = new Set<string>()
  for (const channel of input.channels ?? []) {
    const mediaKey = String(channel?.mediaKey ?? "").trim()
    if (!mediaKey || listed.has(mediaKey)) continue
    listed.add(mediaKey)

    const saved = bareUnique(channel.selectedLineItemIds)
    const current = bareUnique(input.editorIdsByMedia[mediaKey])

    if (current.length === 0) {
      selected[mediaKey] = saved
      missingMediaKeys.push(mediaKey)
      continue
    }

    const currentSet = new Set(current)
    const claimed = new Set<string>()
    const matched = new Set<string>()
    const remaining: string[] = []
    for (const id of saved) {
      if (currentSet.has(id)) {
        claimed.add(id)
        matched.add(id)
      } else {
        remaining.push(id)
      }
    }

    const channelUnresolved: LegacyPartialUnresolved[] = []
    const channelAlias: LegacyPartialAliasMatch[] = []
    if (remaining.length > 0) {
      const loaded = input.loadedLinesByMedia?.[mediaKey] ?? []
      const aliasOf = (id: string) =>
        billingLineIdAlias({ id, mediaKey, mbaNumber: input.mbaNumber })
      const savedByKey = new Map<string, number>()
      for (const id of saved) {
        const key = aliasOf(id)?.key
        if (key) savedByKey.set(key, (savedByKey.get(key) ?? 0) + 1)
      }
      const currentByKey = new Map<string, string[]>()
      for (const id of current) {
        const key = aliasOf(id)?.key
        if (!key) continue
        const list = currentByKey.get(key) ?? []
        list.push(id)
        currentByKey.set(key, list)
      }
      for (const id of remaining) {
        const alias = aliasOf(id)
        if (!alias) {
          channelUnresolved.push({ mediaKey, savedId: id, reason: "no_match" })
          continue
        }
        if (alias.form === "noCode" || alias.form === "productionOld") {
          channelUnresolved.push({ mediaKey, savedId: id, reason: "line_number_not_kept" })
          continue
        }
        const candidates = currentByKey.get(alias.key) ?? []
        if (candidates.length === 0) {
          channelUnresolved.push({ mediaKey, savedId: id, reason: "no_match" })
          continue
        }
        if ((savedByKey.get(alias.key) ?? 0) !== 1 || candidates.length !== 1 || claimed.has(candidates[0]!)) {
          channelUnresolved.push({ mediaKey, savedId: id, reason: "ambiguous" })
          continue
        }
        if (loaded.length > 0 && !loadedLineHoldsAliasNumber(loaded, alias, mediaKey, input.mbaNumber)) {
          channelUnresolved.push({ mediaKey, savedId: id, reason: "ambiguous" })
          continue
        }
        const editorId = candidates[0]!
        claimed.add(editorId)
        matched.add(editorId)
        channelAlias.push({ mediaKey, savedId: id, editorId })
      }
    }

    const savedCount = Number(channel.selectedCount)
    const totalCount = Number(channel.totalCount)
    const allSelected =
      Number.isFinite(totalCount) && totalCount > 0 && savedCount === totalCount
    if (channelUnresolved.length > 0 && allSelected && current.length === totalCount) {
      selected[mediaKey] = [...current]
      expandedMediaKeys.push(mediaKey)
    } else {
      selected[mediaKey] = current.filter((id) => matched.has(id))
      aliasMatches.push(...channelAlias)
      unresolved.push(...channelUnresolved)
    }
    if (!sameSet(selected[mediaKey]!, saved)) changed = true
    const inChannel = new Set(selected[mediaKey])
    const leftOut = current.filter((id) => !inChannel.has(id))
    if (leftOut.length > 0) leftOutByMedia[mediaKey] = leftOut
  }

  const laterAddedMediaKeys = Object.entries(input.editorIdsByMedia)
    .filter(([key, ids]) => !listed.has(key) && (ids?.length ?? 0) > 0)
    .map(([key]) => key)
  // B21fix (R1): the screen shows these channels in the MBA, so the save must too.
  // `buildMbaScopeForSaveBody` sends only the selection.
  for (const key of laterAddedMediaKeys) {
    selected[key] = bareUnique(input.editorIdsByMedia[key])
    changed = true
  }

  return {
    selected,
    changed,
    aliasMatches,
    expandedMediaKeys,
    unresolved,
    missingMediaKeys,
    laterAddedMediaKeys,
    leftOutByMedia,
  }
}

/** Planner-facing names of unresolved saved ids, for the warning. */
export function describeLegacyPartialUnresolved(
  unresolved: readonly LegacyPartialUnresolved[],
  mediaLabelByKey?: Readonly<Record<string, string>>
): string | null {
  if (unresolved.length === 0) return null
  const parts = unresolved.map(
    (u) => `${mediaLabelByKey?.[u.mediaKey] ?? u.mediaKey} ${u.savedId}`
  )
  const head =
    unresolved.length === 1
      ? "A line saved in this partial MBA has no match on the plan, so it stays out of the MBA"
      : `${unresolved.length} lines saved in this partial MBA have no match on the plan, so they stay out of the MBA`
  return `${head}: ${parts.join(", ")}. Check the scope before you publish.`
}

/** The toast on open when saved lines have no match (Q8), or null. */
export function legacyPartialUnmatchedToast(
  unresolved: readonly LegacyPartialUnresolved[],
  mediaLabelByKey?: Readonly<Record<string, string>>
): { variant: "destructive"; title: string; description: string } | null {
  const description = describeLegacyPartialUnresolved(unresolved, mediaLabelByKey)
  return description
    ? { variant: "destructive", title: "Partial MBA lines not matched", description }
    : null
}

/** What the reconcile found when the plan opened, kept for the MBA scope notices. */
export type LegacyPartialOnOpen = {
  unresolved: LegacyPartialUnresolved[]
  leftOutByMedia: Record<string, string[]>
}

/**
 * B21fix (finding 5): the MBA scope notices, recomputed from the current
 * selection so they don't go stale when the planner changes it.
 *
 * An unmatched saved id has no current line, so it can't be ticked itself.
 * A channel's unmatched ids drop off once the planner has ticked in as many
 * of that channel's lines left out on open as there are unmatched ids. A
 * channel the selection doesn't list counts as all in, as `resolveApproval`.
 */
export function currentLegacyPartialNotices(
  onOpen: LegacyPartialOnOpen | null,
  selection: Readonly<Record<string, readonly string[] | undefined>>
): { unresolved: LegacyPartialUnresolved[] } {
  if (!onOpen) return { unresolved: [] }
  const sets = new Map<string, ReadonlySet<string>>()
  const isIn = (mediaKey: string, id: string): boolean => {
    const ids = selection[mediaKey]
    if (ids === undefined) return true
    let set = sets.get(mediaKey)
    if (!set) {
      set = buildCanonicalBillingLineIdSet(ids)
      sets.set(mediaKey, set)
    }
    return canonicalBillingLineIdSetHas(set, id)
  }
  const unmatchedByMedia = new Map<string, number>()
  for (const u of onOpen.unresolved) {
    unmatchedByMedia.set(u.mediaKey, (unmatchedByMedia.get(u.mediaKey) ?? 0) + 1)
  }
  const stillOut = new Set<string>()
  for (const [mediaKey, count] of unmatchedByMedia) {
    const tickedIn = (onOpen.leftOutByMedia[mediaKey] ?? []).filter((id) => isIn(mediaKey, id)).length
    if (tickedIn < count) stillOut.add(mediaKey)
  }
  return { unresolved: onOpen.unresolved.filter((u) => stillOut.has(u.mediaKey)) }
}
