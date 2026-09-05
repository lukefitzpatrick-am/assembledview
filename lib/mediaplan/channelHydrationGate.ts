/**
 * Edit-page channel hydration gate: Save + green reconciliation badges stay
 * held until every expected media container has settled (or failed to load).
 * Also exposes per-channel duplicate line_item_id inflation for draft-save guards.
 */

export type ChannelLoadPhase = "bootstrapping" | "loadingLineItems" | "ready" | "error"
export type ChannelMediaLoadStatus = "idle" | "loading" | "ready" | "error"

export type AllChannelsHydratedInput = {
  loadPhase: ChannelLoadPhase
  /** Enabled media-type flags for this plan (e.g. mp_television). */
  expectedFlags: string[]
  mediaLoadStatus: Partial<Record<string, ChannelMediaLoadStatus>>
  /** Flags that have published container media-line-items (or empty/error settle). */
  settledFlags: Partial<Record<string, boolean>>
}

/**
 * True when campaign line-item load is ready and every expected channel has
 * either settled (container published) or failed (error status).
 */
export function computeAllChannelsHydrated(input: AllChannelsHydratedInput): boolean {
  const { loadPhase, expectedFlags, mediaLoadStatus, settledFlags } = input
  if (loadPhase !== "ready") return false
  if (expectedFlags.length === 0) return true

  return expectedFlags.every((flag) => {
    const status = mediaLoadStatus[flag]
    if (status === "error") return true
    if (status !== "ready") return false
    return settledFlags[flag] === true
  })
}

export type ChannelLineItemDupStats = {
  rows: number
  distinctLineItemIds: number
}

export type ChannelDuplicateSummary = {
  /** Per-channel { rows, distinctLineItemIds } for every provided channel key. */
  perChannel: Record<string, ChannelLineItemDupStats>
  duplicatesDetected: boolean
  /** Only channels where rows > distinct line_item_ids. */
  duplicateChannels: Array<{ channel: string; rows: number; distinctLineItemIds: number }>
  /** Banner aggregates: sum of rows / distinct ids across duplicate channels. */
  inflatedRows: number
  inflatedDistinctIds: number
}

function lineItemIdOf(row: unknown): string {
  if (!row || typeof row !== "object") return ""
  const r = row as Record<string, unknown>
  return String(r.line_item_id ?? r.lineItemId ?? "").trim()
}

/**
 * Count rows vs distinct non-empty line_item_ids per channel.
 * duplicatesDetected when any channel has rows > distinct ids (e.g. OOH 44/22).
 */
export function computeChannelDuplicateStats(
  channelRows: Record<string, readonly unknown[] | null | undefined>
): ChannelDuplicateSummary {
  const perChannel: Record<string, ChannelLineItemDupStats> = {}
  const duplicateChannels: ChannelDuplicateSummary["duplicateChannels"] = []

  for (const [channel, rowsRaw] of Object.entries(channelRows)) {
    const rows = Array.isArray(rowsRaw) ? rowsRaw : []
    const distinct = new Set<string>()
    for (const row of rows) {
      const id = lineItemIdOf(row)
      if (id) distinct.add(id)
    }
    const stats = { rows: rows.length, distinctLineItemIds: distinct.size }
    perChannel[channel] = stats
    if (stats.rows > stats.distinctLineItemIds) {
      duplicateChannels.push({ channel, ...stats })
    }
  }

  const inflatedRows = duplicateChannels.reduce((sum, c) => sum + c.rows, 0)
  const inflatedDistinctIds = duplicateChannels.reduce(
    (sum, c) => sum + c.distinctLineItemIds,
    0
  )

  return {
    perChannel,
    duplicatesDetected: duplicateChannels.length > 0,
    duplicateChannels,
    inflatedRows,
    inflatedDistinctIds,
  }
}

export type ReconciliationBadgeVisibility = {
  showEquals: boolean
  showMismatch: boolean
}

export type ReconciliationBadgeOptions = {
  /** Inflated channel rows — suppress green billable=MBA tick (and mismatch). */
  duplicatesDetected?: boolean
}

/**
 * Until hydration completes (or duplicates inflate totals), suppress both green
 * (equals) and red (mismatch) reconciliation badges.
 */
export function reconciliationBadgeVisibility(
  allChannelsHydrated: boolean,
  billableEqualsMba: boolean,
  opts?: ReconciliationBadgeOptions
): ReconciliationBadgeVisibility {
  if (!allChannelsHydrated || opts?.duplicatesDetected) {
    return { showEquals: false, showMismatch: false }
  }
  return {
    showEquals: billableEqualsMba,
    showMismatch: !billableEqualsMba,
  }
}

export type SaveAllowedOptions = {
  duplicatesDetected?: boolean
}

/**
 * Whether Save (and save-side integrity checks that trust container totals)
 * may proceed.
 */
export function isSaveAllowedAfterHydration(
  allChannelsHydrated: boolean,
  opts?: SaveAllowedOptions
): boolean {
  if (!allChannelsHydrated) return false
  if (opts?.duplicatesDetected) return false
  return true
}

/** Label for the sticky Save affordance from PUT mode / predicted next save. */
export function formatSaveModeLabel(
  mode: "overwrite" | "increment" | "working_draft" | "increment_unpublished",
  versionNumber: number
): string {
  const n = Math.max(1, Math.trunc(Number(versionNumber) || 1))
  if (mode === "overwrite") return `Draft — overwrites v${n}`
  if (mode === "working_draft") return `Working draft of v${n}`
  if (mode === "increment_unpublished") {
    return `Will cut v${n} (stays unpublished)`
  }
  return `Will create v${n}`
}

/** Human labels for mp_* hydration flags (Save hold copy). */
const HYDRATION_CHANNEL_LABELS: Record<string, string> = {
  mp_television: "Television",
  mp_radio: "Radio",
  mp_newspaper: "Newspaper",
  mp_magazines: "Magazines",
  mp_ooh: "OOH",
  mp_cinema: "Cinema",
  mp_digidisplay: "Digital Display",
  mp_digiaudio: "Digital Audio",
  mp_digivideo: "Digital Video",
  mp_bvod: "BVOD",
  mp_integration: "Integration",
  mp_search: "Search",
  mp_socialmedia: "Social",
  mp_progdisplay: "Prog Display",
  mp_progvideo: "Prog Video",
  mp_progbvod: "Prog BVOD",
  mp_progaudio: "Prog Audio",
  mp_progooh: "Prog OOH",
  mp_influencers: "Influencers",
  mp_production: "Production",
  mp_fixedfee: "Fixed Fee",
}

export function hydrationChannelLabel(flag: string): string {
  return HYDRATION_CHANNEL_LABELS[flag] ?? flag.replace(/^mp_/, "").replace(/_/g, " ")
}

/**
 * Flags still blocking Save: not ready, or ready but not yet settled.
 * Error status does not block (matches computeAllChannelsHydrated).
 */
export function listOutstandingHydrationChannels(input: AllChannelsHydratedInput): string[] {
  const { loadPhase, expectedFlags, mediaLoadStatus, settledFlags } = input
  if (loadPhase !== "ready") {
    return expectedFlags.map(hydrationChannelLabel)
  }
  return expectedFlags
    .filter((flag) => {
      const status = mediaLoadStatus[flag]
      if (status === "error") return false
      if (status !== "ready") return true
      return settledFlags[flag] !== true
    })
    .map(hydrationChannelLabel)
}

/** Toast hang copy: name outstanding containers after this delay. */
export const HYDRATION_TOAST_HANG_MS = 10_000

export type HydrationToastItem = {
  flag: string
  name: string
  status: "pending" | "success" | "error"
}

/**
 * Per-channel toast rows from the SAME maps as `computeAllChannelsHydrated`.
 * Error counts as complete (matches the save gate). Ready without settle stays pending.
 */
export function buildHydrationToastItems(
  input: AllChannelsHydratedInput
): HydrationToastItem[] {
  return input.expectedFlags.map((flag) => {
    const loadStatus = input.mediaLoadStatus[flag]
    const name = hydrationChannelLabel(flag)
    if (loadStatus === "error") {
      return { flag, name, status: "error" }
    }
    if (loadStatus === "ready" && input.settledFlags[flag] === true) {
      return { flag, name, status: "success" }
    }
    return { flag, name, status: "pending" }
  })
}

export function hydrationToastReadyCount(items: readonly HydrationToastItem[]): number {
  return items.filter((item) => item.status === "success" || item.status === "error").length
}

export function formatHydrationToastHeader(opts: {
  readyCount: number
  totalCount: number
  hangLabels: string[]
  bootstrapping?: boolean
}): string {
  if (opts.bootstrapping && opts.totalCount === 0) {
    return "Loading campaign details…"
  }
  const base = `${opts.readyCount} of ${opts.totalCount} containers ready`
  if (opts.hangLabels.length === 0) return base
  return `${base} — still waiting on ${opts.hangLabels.join(", ")}`
}

/**
 * Disabled-with-reason copy for the Save control while channels hydrate.
 * Gate stays closed — this only names why.
 */
export function formatSaveHydrationHoldReason(
  outstandingLabels: string[],
  opts?: { loadPhaseReady?: boolean }
): string | null {
  if (outstandingLabels.length === 0) return null
  if (opts?.loadPhaseReady === false) {
    if (outstandingLabels.length === 1) {
      return `Waiting for ${outstandingLabels[0]} to load — you can't save yet`
    }
    return `Waiting for ${outstandingLabels.length} channels to load — you can't save yet`
  }
  if (outstandingLabels.length === 1) {
    return `Waiting for ${outstandingLabels[0]} to load — you can't save yet`
  }
  return `Waiting for ${outstandingLabels.length} channels to load — you can't save yet`
}

/**
 * Late success after the hydration watchdog: promote that channel to ready so
 * section error UI never overlays already-loaded line items.
 */
export function mediaLoadStatusAfterChannelSuccess(
  prev: Partial<Record<string, ChannelMediaLoadStatus>>,
  flag: string
): Partial<Record<string, ChannelMediaLoadStatus>> {
  return { ...prev, [flag]: "ready" }
}

export type ChannelLoadToastItem = {
  name: string
  status: "pending" | "success" | "error" | "skipped"
  error?: string
}

/**
 * Clear a channel's load-toast error (e.g. watchdog "did not finish loading")
 * when its fetch succeeds — including after the watchdog already marked error.
 */
export function lineItemLoadToastAfterChannelSuccess(
  prev: readonly ChannelLoadToastItem[],
  name: string
): ChannelLoadToastItem[] {
  const existing = prev.find((item) => item.name === name)
  if (!existing) {
    return [...prev, { name, status: "success" }]
  }
  return prev.map((item) =>
    item.name === name ? { name: item.name, status: "success" } : item
  )
}
