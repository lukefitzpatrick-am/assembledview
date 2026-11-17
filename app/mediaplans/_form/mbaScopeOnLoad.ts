/**
 * Which lines a saved version's MBA covers, when the plan opens (edit; B52).
 * Order: the version's `mba_scope`, then the `mba_line_approvals` GET, then
 * (MB-33, B21) an old partial MBA's channel list when the GET has no rows.
 *
 * The page applies the result. Saved months are never touched and values are
 * not recomputed for an old partial MBA: only the ids move to the current ids.
 */
import type { FetchMbaLineApprovalsResult } from "@/lib/finance/mbaLineApprovalsClient"
import { selectedLineItemIdsFromApprovalRows } from "@/lib/finance/mbaLineApprovalsClient"
import { parsePersistedMbaScope, selectedLineItemIdsByMediaFromMbaScope } from "@/lib/mediaplan/mbaScopeClient"
import {
  legacyPartialUnmatchedToast,
  reconcileLegacyPartialSelection,
  type LegacyPartialLoadedLines,
  type LegacyPartialOnOpen,
} from "@/lib/mediaplan/reconcileLegacyPartialSelection"

type LegacyChannels = Parameters<typeof reconcileLegacyPartialSelection>[0]["channels"]

export type MbaScopeOnLoad =
  /** An old partial MBA waits until every channel has its lines; nothing is read yet. */
  | { kind: "wait" }
  /** A scope or approval rows: the lines in the MBA, and the saved months (null: the baseline months). */
  | { kind: "selected"; selected: Record<string, string[]>; isPartial: boolean; monthYears: string[] | null }
  /** No approval rows: an old partial MBA's lines matched to today's ids, or nothing to do. */
  | { kind: "legacy"; legacy: LegacyPartialOpen | null }

/** What the page sets for an old partial MBA. No months and no values: they stay as saved. */
type LegacyPartialOpen = {
  onOpen: LegacyPartialOnOpen
  laterAddedMediaKeys: string[]
  /** The ids moved to the current ids (B21fix R1), or null when nothing moved. */
  selected: Record<string, string[]> | null
  /** Shown once, on open (B21fix finding 5). */
  toast: ReturnType<typeof legacyPartialUnmatchedToast>
}

type ScopeSelection = Extract<MbaScopeOnLoad, { kind: "selected" }>

/** The version's own `mba_scope`, read first and at once, or null when it has none. */
export function mbaScopeFromVersion(mbaScope: unknown, editorIdsByMedia: Record<string, string[]>): ScopeSelection | null {
  const persisted = parsePersistedMbaScope(mbaScope)
  if (!persisted) return null
  return {
    kind: "selected",
    selected: selectedLineItemIdsByMediaFromMbaScope({
      lineItemIds: persisted.lineItemIds,
      allLineIdsByMedia: editorIdsByMedia,
    }),
    isPartial: persisted.partial,
    monthYears: persisted.monthYears,
  }
}

/** With no `mba_scope`: the approvals GET, then an old partial MBA's channels. */
export async function resolveMbaScopeOnLoad(args: {
  /** Editor ids by billing key, in editor order. */
  editorIdsByMedia: Record<string, string[]>
  /** An old partial MBA's channels (`billing_schedule` partial metadata), or null. */
  legacyChannels: LegacyChannels | null
  allChannelsHydrated: boolean
  /** B21fix finding 2: the lines as loaded, before the editor renumbers them. */
  loadedLinesByMedia: LegacyPartialLoadedLines
  mbaNumber: string
  mediaLabelByKey: Readonly<Record<string, string>>
  fetchApprovals: () => Promise<FetchMbaLineApprovalsResult>
}): Promise<MbaScopeOnLoad> {
  // MB-33 (B21): an old partial MBA is matched once every channel has its lines,
  // so a channel that loads late isn't read as having none.
  if (args.legacyChannels && !args.allChannelsHydrated) return { kind: "wait" }

  const result = await args.fetchApprovals()
  if (!result.ok || !result.available || !result.rows.length) {
    return { kind: "legacy", legacy: args.legacyChannels ? legacyPartialOpen(args, args.legacyChannels) : null }
  }
  const selected = selectedLineItemIdsFromApprovalRows({ rows: result.rows, allLineIdsByMedia: args.editorIdsByMedia })
  const isPartial = Object.entries(selected).some(([k, ids]) => ids.length < (args.editorIdsByMedia[k]?.length ?? 0))
  return { kind: "selected", selected, isPartial, monthYears: null }
}

function legacyPartialOpen(
  args: Parameters<typeof resolveMbaScopeOnLoad>[0],
  channels: LegacyChannels
): LegacyPartialOpen {
  const r = reconcileLegacyPartialSelection({
    channels,
    editorIdsByMedia: args.editorIdsByMedia,
    loadedLinesByMedia: args.loadedLinesByMedia,
    mbaNumber: args.mbaNumber,
  })
  return {
    onOpen: { unresolved: r.unresolved, addedSince: r.addedSince, leftOutByMedia: r.leftOutByMedia },
    laterAddedMediaKeys: r.laterAddedMediaKeys,
    selected: r.changed ? r.selected : null,
    toast: legacyPartialUnmatchedToast(r.unresolved, args.mediaLabelByKey),
  }
}
