/**
 * Edit-page channel hydration gate: Save + green reconciliation badges stay
 * held until every expected media container has settled (or failed to load).
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

export type ReconciliationBadgeVisibility = {
  showEquals: boolean
  showMismatch: boolean
}

/**
 * Until hydration completes, suppress both green (equals) and red (mismatch)
 * reconciliation badges so a partial channel set cannot self-match as green.
 */
export function reconciliationBadgeVisibility(
  allChannelsHydrated: boolean,
  billableEqualsMba: boolean
): ReconciliationBadgeVisibility {
  if (!allChannelsHydrated) {
    return { showEquals: false, showMismatch: false }
  }
  return {
    showEquals: billableEqualsMba,
    showMismatch: !billableEqualsMba,
  }
}

/**
 * Whether Save (and save-side integrity checks that trust container totals)
 * may proceed.
 */
export function isSaveAllowedAfterHydration(allChannelsHydrated: boolean): boolean {
  return allChannelsHydrated
}
