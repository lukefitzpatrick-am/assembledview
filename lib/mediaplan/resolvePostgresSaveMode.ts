import type { SavePlanMode } from "@/lib/data/savePlan"
import { nextMbaVersionNumber } from "@/lib/mediaplan/nextMbaVersionNumber"
import { normaliseStatus } from "@/lib/mediaplan/campaignStatusGuard"

export type ResolvePostgresSaveModeInput = {
  /** Form / master campaign status (draft vs approved/…). */
  campaignStatus: string | null | undefined
  /**
   * Approval-set change after a persisted baseline — mirrors PUT `forceIncrement`
   * (cuts a new version even while still Draft).
   */
  forceIncrement: boolean
  /** Published / working version number (master.version_number / selected). */
  publishedVersionNumber: number
  /** Count of existing version rows for this MBA (0 → first save is v1). */
  versionRowCount: number
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
 * Map create/edit save intent onto T4a modes, mirroring MBA PUT semantics
 * (3e22b836 / ddc1ebbe):
 *
 * - Draft + existing published row + !forceIncrement → **overwrite in place**
 *   (`mode: "draft"`, same version_number).
 * - Otherwise → cut next version and advance publish pointer in one txn
 *   (`mode: "publish"`). Today's Xano path stages then PATCH-publishes; Postgres
 *   collapses that into one transactional publish. `campaignStatus` is passed
 *   through so a Draft first-save can still publish v1 while remaining Draft.
 *
 * `new_version` is unused by the editor (no stage-without-publish UI path).
 */
export function resolvePostgresSaveMode(
  input: ResolvePostgresSaveModeInput
): ResolvePostgresSaveModeResult {
  const status = normaliseStatus(input.campaignStatus ?? "")
  const published = Number(input.publishedVersionNumber) || 0
  const rowCount = Math.max(0, Number(input.versionRowCount) || 0)

  const overwrite =
    status === "draft" && published > 0 && !input.forceIncrement

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
