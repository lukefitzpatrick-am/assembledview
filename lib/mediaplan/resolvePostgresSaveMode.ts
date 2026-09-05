import type { SavePlanMode } from "@/lib/data/savePlan"
import { nextMbaVersionNumber } from "@/lib/mediaplan/nextMbaVersionNumber"
import { isVersionPublished } from "@/lib/mediaplan/versionPublication"

/**
 * Interim: Save cuts a new version and stamps `published_at` in the same
 * operation. Revert to `false` when the real publish flow ships — that
 * restores working_draft, unpublished overwrite, NV-1 unpublished cut,
 * and the explicit Publish button.
 */
export const SAVE_PUBLISHES_IMMEDIATELY = true

/** Hide the explicit Publish button while Save already publishes. */
export function showExplicitPublishButton(isPublished: boolean): boolean {
  if (SAVE_PUBLISHES_IMMEDIATELY) return false
  return isPublished
}

export type ResolvePostgresSaveModeInput = {
  /**
   * @deprecated VC Stage 1 — no longer used for overwrite vs publish.
   * Retained so call sites can keep passing campaign status for other UI copy
   * without a twin-signature rewrite; publication uses `tipPublishedAt` only.
   */
  campaignStatus?: string | null | undefined
  /**
   * Approval-set change after a persisted baseline — mirrors PUT `forceIncrement`
   * (cuts a new version even while still Draft).
   */
  forceIncrement: boolean
  /**
   * Newest version ordinal for this campaign (master tip / `latestVersionNumber`).
   * Not the version loaded in the editor — that is `editingVersionNumber`.
   * Confusing these two is what made a save from an older version overwrite the
   * newest. Create passes 0.
   */
  publishedVersionNumber: number
  /**
   * Version ordinal currently loaded in the editor. When this is lower than
   * publishedVersionNumber the user is editing an older version, and a save
   * must cut the next number rather than overwrite the newest.
   * Omit (or pass equal to publishedVersionNumber) when editing the newest.
   * Create always omits it.
   */
  editingVersionNumber?: number | null
  /** Count of existing version rows for this MBA (0 → first save is v1). */
  versionRowCount: number
  /**
   * VC Stage 1 — `published_at` of the tip version being saved over.
   * Overwrite in place iff this is unpublished (null) and tip > 0.
   * Omit only when tip is 0 (first save); when tip > 0, pass the row value.
   */
  tipPublishedAt?: string | null
  /**
   * VC Stage 2b — `save` (default) vs explicit `publish`.
   * Save on a published tip → working draft (no version cut).
   * Publish / forceIncrement on published tip → cut next version as today.
   * forceIncrement on unpublished tip → `new_version` (NV-1; stays unpublished).
   */
  intent?: "save" | "publish"
}

export type ResolvePostgresSaveModeResult =
  | {
      /** T4a `savePlanVersion` mode. */
      mode: "draft"
      versionNumber: number
      uiMode: "overwrite"
    }
  | {
      mode: "publish"
      versionNumber: number
      uiMode: "increment"
    }
  | {
      /**
       * NV-1 unpublished-tip forceIncrement, or save while the editor is on
       * an older version than the newest. Cuts tip+1 without stamping /
       * advancing `published_version_id`.
       */
      mode: "new_version"
      versionNumber: number
      uiMode: "increment_unpublished"
    }
  | {
      /**
       * Never POST to `/api/plans/save` — write `plan_working_drafts` instead.
       */
      mode: null
      versionNumber: number
      uiMode: "working_draft"
    }

/**
 * Map create/edit save intent onto T4a modes / Stage 2b working draft.
 *
 * While `SAVE_PUBLISHES_IMMEDIATELY` is on, every intent returns
 * `{ mode: "publish", uiMode: "increment" }` at `nextMbaVersionNumber`.
 * Flip the constant to restore the table below.
 *
 * `publishedVersionNumber` is the NEWEST version. `editingVersionNumber` is the
 * version currently loaded in the editor. They are not interchangeable.
 *
 * - Editing an older version (`editing < published`) + save → cut next number
 *   as `new_version` / `increment_unpublished` (does not overwrite the newest).
 * - Unpublished newest + save + !forceIncrement → overwrite in place (`draft`).
 * - Published newest + save + !forceIncrement → `working_draft` (version row untouched).
 * - First create (tip 0) or intent `publish` → `publish` / increment.
 * - forceIncrement (or non-overwrite fall-through) on unpublished tip →
 *   `new_version` / `increment_unpublished` (NV-1). Published-tip forceIncrement
 *   and intent `publish` still return `publish`. Older-version + intent `publish`
 *   also keeps that publish path.
 *
 * `new_version` is returned for unpublished-tip forceIncrement (NV-1) and for
 * save-from-older-version. Intent `publish` and tip 0 still return `publish`.
 *
 * Edit may pass `versionRowCount: 0` while the tip exists (version history is
 * lazy-loaded). Treat published tip as proof of at least that many rows so
 * publish never resolves to "Will create v1" / INSERT version_number=1.
 * Create still passes published=0 + rowCount=0 → first publish v1.
 */
export function resolvePostgresSaveMode(
  input: ResolvePostgresSaveModeInput
): ResolvePostgresSaveModeResult {
  const published = Number(input.publishedVersionNumber) || 0
  const rowCountRaw = Math.max(0, Number(input.versionRowCount) || 0)
  const rowCount =
    rowCountRaw === 0 && published > 0 ? published : rowCountRaw
  const intent = input.intent === "publish" ? "publish" : "save"
  const editing = Number(input.editingVersionNumber) || 0
  const isOlderVersion = editing > 0 && published > 0 && editing < published

  // Interim: every save intent cuts and publishes. Flag-off restores the
  // four-way table below (overwrite / working_draft / new_version / publish).
  if (SAVE_PUBLISHES_IMMEDIATELY) {
    return {
      mode: "publish",
      versionNumber: nextMbaVersionNumber(rowCount, published),
      uiMode: "increment",
    }
  }

  if (isOlderVersion && intent === "save") {
    return {
      mode: "new_version",
      versionNumber: nextMbaVersionNumber(rowCount, published),
      uiMode: "increment_unpublished",
    }
  }

  // Tip unpublished → overwrite; tip published → working draft (save) or spawn
  // (publish / forceIncrement). No status fallback.
  // When tip > 0 and tipPublishedAt is omitted, assume published so a forgotten
  // caller cannot overwrite a live tip. Pass `null` for unpublished.
  const tipPublishedAt =
    published > 0 && input.tipPublishedAt === undefined
      ? "assumed-published"
      : (input.tipPublishedAt ?? null)
  const tipUnpublished =
    published > 0 && !isVersionPublished({ publishedAt: tipPublishedAt })

  const overwrite =
    tipUnpublished && !input.forceIncrement && intent !== "publish"

  if (overwrite) {
    return {
      mode: "draft",
      versionNumber: published,
      uiMode: "overwrite",
    }
  }

  const tipPublished =
    published > 0 && isVersionPublished({ publishedAt: tipPublishedAt })
  if (
    tipPublished &&
    !input.forceIncrement &&
    intent === "save"
  ) {
    return {
      mode: null,
      versionNumber: published,
      uiMode: "working_draft",
    }
  }

  const versionNumber = nextMbaVersionNumber(rowCount, published)

  // NV-1: forceIncrement (or non-overwrite fall-through) on unpublished tip
  // cuts a new unpublished row — do not stamp / publish. Intent publish and
  // published-tip forceIncrement keep mode: "publish". Tip 0 stays publish.
  if (tipUnpublished && intent !== "publish") {
    return {
      mode: "new_version",
      versionNumber,
      uiMode: "increment_unpublished",
    }
  }

  return {
    mode: "publish",
    versionNumber,
    uiMode: "increment",
  }
}

/** Narrow helper — true when the editor must not call `/api/plans/save`. */
export function isWorkingDraftSaveMode(
  r: ResolvePostgresSaveModeResult
): r is Extract<ResolvePostgresSaveModeResult, { uiMode: "working_draft" }> {
  return r.uiMode === "working_draft"
}

/** SavePlanMode for POST bodies — never call when `uiMode === "working_draft"`. */
export function savePlanModeOrThrow(
  r: ResolvePostgresSaveModeResult
): SavePlanMode {
  if (r.mode == null) {
    throw new Error(
      "working_draft save must write plan_working_drafts — not /api/plans/save"
    )
  }
  return r.mode
}

export type BuildSaveModeInputArgs = {
  latestVersionNumber?: number | null
  mediaPlan?: {
    version_number?: number | null
    published_at?: string | null
  } | null
  availableVersions?: Array<{
    version_number: number
    published_at?: string | null
  }>
  selectedVersionNumber?: number | null
  forceIncrement: boolean
  intent?: "save" | "publish"
  campaignStatus?: string | null
}

function maxAvailableVersionNumber(
  versions: BuildSaveModeInputArgs["availableVersions"]
): number | undefined {
  if (!versions?.length) return undefined
  let max = versions[0]!.version_number
  for (let i = 1; i < versions.length; i++) {
    const n = versions[i]!.version_number
    if (n > max) max = n
  }
  return max
}

/**
 * Shared input assembly for the edit-page label and submit paths.
 * Both call sites must go through this so published/editing/tipPublishedAt
 * cannot drift. `publishedVersionNumber` is the newest; `editingVersionNumber`
 * is the version loaded in the editor.
 */
export function buildSaveModeInput(
  args: BuildSaveModeInputArgs
): ResolvePostgresSaveModeInput {
  const publishedVersionNumber =
    Number(
      args.latestVersionNumber ??
        args.mediaPlan?.version_number ??
        maxAvailableVersionNumber(args.availableVersions) ??
        0
    ) || 0
  const editingVersionNumber =
    args.selectedVersionNumber ?? args.mediaPlan?.version_number ?? null
  // Same as the former submit ternary: loaded row's published_at when the
  // property is present (including null); else the newest row in availableVersions.
  const loadedPublishedAt = args.mediaPlan?.published_at
  const tipPublishedAt =
    loadedPublishedAt !== undefined
      ? loadedPublishedAt
      : args.availableVersions?.find((v) => v.version_number === publishedVersionNumber)
          ?.published_at

  return {
    campaignStatus: args.campaignStatus,
    forceIncrement: args.forceIncrement,
    publishedVersionNumber,
    editingVersionNumber,
    versionRowCount: args.availableVersions?.length ?? 0,
    tipPublishedAt,
    intent: args.intent,
  }
}
