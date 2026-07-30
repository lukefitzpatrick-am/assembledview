/**
 * Defense-in-depth for media-plan version publish (PATCH master.version_number).
 *
 * Rejects publishing a version that has channel flags enabled but zero child
 * line items. Uses the same mp_plannumber / version_number (+ legacy FK) match
 * chain as MBA GET — never a stricter filter.
 *
 * FAIL OPEN: any error/timeout while counting children (or loading the version
 * row) allows the publish and logs a warning. Client Part A is the primary gate.
 *
 * Client-safe flag helpers live in `publishVersionIntegrityClient.ts` so the
 * edit page never pulls `fetchChannelLineItemsByMba` → `readMediaPlans` (server-only).
 */

import "server-only"

import {
  fetchXanoTableForEndpoint,
  type ChannelLineItemEndpoint,
} from "@/lib/api/fetchChannelLineItemsByMba"
import {
  PUBLISH_INTEGRITY_CHANNEL_FLAGS,
  enabledPublishIntegrityChannels,
  type PublishIntegrityChannelKey,
} from "@/lib/mediaplan/publishVersionIntegrityClient"

export {
  PUBLISH_INTEGRITY_CHANNEL_FLAGS,
  countEnabledPublishIntegrityFlags,
  enabledPublishIntegrityChannels,
  flagIsEnabledForPublishIntegrity,
  isPublishVersionAdvance,
  shouldBlockEmptyPublish,
  type PublishIntegrityChannelKey,
} from "@/lib/mediaplan/publishVersionIntegrityClient"

const CHANNEL_ENDPOINTS: Record<PublishIntegrityChannelKey, ChannelLineItemEndpoint> = {
  television: "media_plan_television",
  radio: "media_plan_radio",
  newspaper: "media_plan_newspaper",
  magazines: "media_plan_magazines",
  ooh: "media_plan_ooh",
  cinema: "media_plan_cinema",
  digitalDisplay: "media_plan_digi_display",
  digitalAudio: "media_plan_digi_audio",
  digitalVideo: "media_plan_digi_video",
  bvod: "media_plan_digi_bvod",
  integration: "media_plan_integrations",
  search: "media_plan_search",
  socialMedia: "media_plan_social",
  progDisplay: "media_plan_prog_display",
  progVideo: "media_plan_prog_video",
  progBvod: "media_plan_prog_bvod",
  progAudio: "media_plan_prog_audio",
  progOoh: "media_plan_prog_ooh",
  influencers: "media_plan_influencers",
  production: "media_plan_production",
}

export type PublishLineItemIntegrityResult =
  | { ok: true; skipped?: boolean; failOpen?: boolean; reason?: string }
  | { ok: false; status: 409; error: string }

export type PublishLineItemIntegrityDeps = {
  fetchVersionRow: (
    mbaNumber: string,
    versionNumber: number,
  ) => Promise<Record<string, unknown> | null>
  /** Returns total child row count across the given enabled channels (GET-parity filter). */
  countChildrenForChannels: (args: {
    mbaNumber: string
    versionNumber: number
    mediaPlanVersionId: number | null
    enabledChannels: PublishIntegrityChannelKey[]
  }) => Promise<number>
  logWarn?: (message: string, meta?: Record<string, unknown>) => void
}

function parseVersionId(raw: unknown): number | null {
  if (raw === undefined || raw === null) return null
  const n = typeof raw === "string" ? parseInt(raw, 10) : Number(raw)
  return Number.isFinite(n) ? n : null
}

/**
 * When advancing master.version_number: if the target version has any mp_* flag
 * true but zero matching children, reject with 409. Query failures fail open.
 */
export async function checkPublishLineItemIntegrity(
  args: {
    mbaNumber: string
    targetVersionNumber: number
  } & PublishLineItemIntegrityDeps,
): Promise<PublishLineItemIntegrityResult> {
  const { mbaNumber, targetVersionNumber, fetchVersionRow, countChildrenForChannels, logWarn } =
    args
  const warn =
    logWarn ??
    ((message: string, meta?: Record<string, unknown>) => {
      console.warn(message, meta ?? {})
    })

  let versionRow: Record<string, unknown> | null
  try {
    versionRow = await fetchVersionRow(mbaNumber, targetVersionNumber)
  } catch (error) {
    warn("[publish integrity] version row fetch failed; fail-open allow", {
      mbaNumber,
      targetVersionNumber,
      error: error instanceof Error ? error.message : String(error),
    })
    return { ok: true, failOpen: true, reason: "version_row_fetch_error" }
  }

  if (!versionRow) {
    warn("[publish integrity] version row missing; fail-open allow", {
      mbaNumber,
      targetVersionNumber,
    })
    return { ok: true, failOpen: true, reason: "version_row_missing" }
  }

  const enabledChannels = enabledPublishIntegrityChannels(versionRow)
  if (enabledChannels.length === 0) {
    return { ok: true, skipped: true, reason: "no_enabled_channels" }
  }

  const mediaPlanVersionId = parseVersionId(versionRow.id)

  let totalChildren: number
  try {
    totalChildren = await countChildrenForChannels({
      mbaNumber,
      versionNumber: targetVersionNumber,
      mediaPlanVersionId,
      enabledChannels,
    })
  } catch (error) {
    warn("[publish integrity] child-count query failed; fail-open allow", {
      mbaNumber,
      targetVersionNumber,
      enabledChannels,
      error: error instanceof Error ? error.message : String(error),
    })
    return { ok: true, failOpen: true, reason: "child_count_error" }
  }

  if (totalChildren === 0) {
    return {
      ok: false,
      status: 409,
      error: `Cannot publish version ${targetVersionNumber}: enabled media channels have zero line items (mp_plannumber/version_number match).`,
    }
  }

  return { ok: true }
}

/** Default child counter: parallel GET-parity fetches for enabled channels only. */
export async function countPublishIntegrityChildren(args: {
  mbaNumber: string
  versionNumber: number
  mediaPlanVersionId: number | null
  enabledChannels: PublishIntegrityChannelKey[]
}): Promise<number> {
  const { mbaNumber, versionNumber, mediaPlanVersionId, enabledChannels } = args
  const results = await Promise.all(
    enabledChannels.map(async (key) => {
      const items = await fetchXanoTableForEndpoint(
        CHANNEL_ENDPOINTS[key],
        mbaNumber,
        versionNumber,
        mediaPlanVersionId,
        `PUBLISH_INTEGRITY_${key}`,
      )
      return items.length
    }),
  )
  return results.reduce((sum, n) => sum + n, 0)
}
