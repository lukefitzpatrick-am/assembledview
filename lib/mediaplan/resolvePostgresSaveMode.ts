import type { SavePlanMode } from "@/lib/data/savePlan"
import { nextMbaVersionNumber } from "@/lib/mediaplan/nextMbaVersionNumber"
import { isVersionPublished } from "@/lib/mediaplan/versionPublication"

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
  /** Published / working version number (master.version_number / selected). */
  publishedVersionNumber: number
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
   * Publish / forceIncrement → cut next version as today.
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
       * Never POST to `/api/plans/save` — write `plan_working_drafts` instead.
       * `new_version` stays unused in Stage 2.
       */
      mode: null
      versionNumber: number
      uiMode: "working_draft"
    }

/**
 * Map create/edit save intent onto T4a modes / Stage 2b working draft.
 *
 * - Unpublished tip + save + !forceIncrement → overwrite in place (`draft`).
 * - Published tip + save + !forceIncrement → `working_draft` (version row untouched).
 * - First create (tip 0), forceIncrement, or intent `publish` → `publish` / increment.
 *
 * `new_version` is unused by the editor (Stage 3) — this helper must never return it.
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
