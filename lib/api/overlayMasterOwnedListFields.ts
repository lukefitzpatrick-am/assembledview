/**
 * Master-owned list scalars that Xano `media_plan_versions_latest` carried inline
 * but Postgres `media_plan_versions` omit (they live on `media_plan_masters`).
 * Also copies `published_version_id` from the master when that field is present.
 *
 * Shared by:
 * - `mediaPlansListCache` → `GET /api/mediaplans` (Campaigns list)
 * - `mediaPlanVersionsCache` → `GET /api/media_plans` (dashboard)
 *
 * Keep both callers on this helper — DI-9 / DI-9b drifted when only one path overlaid.
 */

import { mbaJoinKey } from "@/lib/mediaplan/mbaNumber"
import { publishedVersionIdFromMaster } from "@/lib/mediaplan/publishedVersionGuard"

export const MEDIA_PLANS_LIST_MASTER_OWNED_STRING_FIELDS = [
  "mp_client_name",
] as const

/**
 * Overlay master-owned list fields onto a latest-version row.
 * Prefer version value when already present (Xano `_latest`); fill from master
 * otherwise (Postgres). Always coerce required strings so search/sort never see undefined.
 * Copies `published_version_id` from the master when that field is present
 * (never from the version row `id`). Omit the key when the master lacks it.
 */
export function overlayMasterOwnedListFields(
  versionPlan: Record<string, unknown> | null | undefined,
  masterData: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const base =
    versionPlan && typeof versionPlan === "object" ? { ...versionPlan } : {}
  for (const key of MEDIA_PLANS_LIST_MASTER_OWNED_STRING_FIELDS) {
    const fromVersion = base[key]
    const fromMaster = masterData?.[key]
    const raw =
      fromVersion != null && String(fromVersion).length > 0
        ? fromVersion
        : fromMaster != null
          ? fromMaster
          : fromVersion ?? ""
    base[key] = typeof raw === "string" ? raw : String(raw ?? "")
  }
  const pointer = publishedVersionIdFromMaster(masterData)
  if (pointer !== undefined) {
    base.published_version_id = pointer
  }
  return base
}

/**
 * Apply {@link overlayMasterOwnedListFields} to each version row, joining masters
 * by case-insensitive `mbaJoinKey`. Rows without a master are kept (empty
 * master-owned strings). Does not rewrite `mba_number`, `version_number`, or
 * other version-owned fields.
 */
export function applyMasterOwnedOverlayByMba(
  versionRows: Array<Record<string, unknown> | null | undefined>,
  masters: Array<Record<string, unknown> | null | undefined>,
): Record<string, unknown>[] {
  const masterMap = new Map<string, Record<string, unknown>>()
  for (const master of masters) {
    const key = mbaJoinKey(master?.mba_number)
    if (!key) continue
    masterMap.set(key, master as Record<string, unknown>)
  }

  return versionRows.map((row) => {
    const key = mbaJoinKey(row?.mba_number)
    const master = key ? masterMap.get(key) : undefined
    return overlayMasterOwnedListFields(row, master)
  })
}
