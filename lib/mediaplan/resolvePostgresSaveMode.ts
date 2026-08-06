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
}

export type ResolvePostgresSaveModeResult = {
  /** T4a `savePlanVersion` mode. */
  mode: SavePlanMode
  /** Version number written by the txn. */
  versionNumber: number
  /**
   * UI label mode — matches today's `formatSaveModeLabel` / PUT `mode` field.
   * `overwrite` ⟺ in-place draft replace-set (T4a `draft`).
   */
  uiMode: "overwrite" | "increment"
}

/**
 * Map create/edit save intent onto T4a modes.
 *
 * VC Stage 1: overwrite in place iff the tip version is **unpublished**
 * (`published_at` null) and tip > 0 and !forceIncrement — never
 * `campaign_status === "draft"`. A published tip (including
 * `campaign_status=draft`) always cuts a new version via `mode: "publish"`.
 * An unpublished tip (including `campaign_status=approved`) overwrites.
 *
 * `new_version` is unused by the editor (no stage-without-publish UI path) —
 * this helper must never return it.
 *
 * Edit may pass `versionRowCount: 0` while the tip exists (version history is
 * lazy-loaded). Treat published tip as proof of at least that many rows so
 * draft→booked never resolves to "Will create v1" / INSERT version_number=1.
 * Create still passes published=0 + rowCount=0 → first publish v1.
 */
export function resolvePostgresSaveMode(
  input: ResolvePostgresSaveModeInput
): ResolvePostgresSaveModeResult {
  const published = Number(input.publishedVersionNumber) || 0
  const rowCountRaw = Math.max(0, Number(input.versionRowCount) || 0)
  const rowCount =
    rowCountRaw === 0 && published > 0 ? published : rowCountRaw

  // Tip unpublished → overwrite; tip published → spawn. No status fallback.
  // When tip > 0 and tipPublishedAt is omitted, assume published (spawn) so a
  // forgotten caller cannot overwrite a live tip. Pass `null` for unpublished.
  const tipPublishedAt =
    published > 0 && input.tipPublishedAt === undefined
      ? "assumed-published"
      : (input.tipPublishedAt ?? null)
  const tipUnpublished =
    published > 0 && !isVersionPublished({ publishedAt: tipPublishedAt })

  const overwrite = tipUnpublished && !input.forceIncrement

  if (overwrite) {
    return {
      mode: "draft",
      versionNumber: published,
      uiMode: "overwrite",
    }
  }

  const versionNumber = nextMbaVersionNumber(rowCount, published)
  return {
    mode: "publish",
    versionNumber,
    uiMode: "increment",
  }
}
