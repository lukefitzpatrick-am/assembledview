/**
 * Master-owned list scalars that Xano `media_plan_versions_latest` carried inline
 * but Postgres `media_plan_versions` omit (they live on `media_plan_masters`).
 *
 * Shared by:
 * - `mediaPlansListCache` → `GET /api/mediaplans` (Campaigns list)
 * - `mediaPlanVersionsCache` → `GET /api/media_plans` (dashboard)
 *
 * Keep both callers on this helper — DI-9 / DI-9b drifted when only one path overlaid.
 */

export const MEDIA_PLANS_LIST_MASTER_OWNED_STRING_FIELDS = [
  "mp_client_name",
] as const

/**
 * Overlay master-owned list fields onto a latest-version row.
 * Prefer version value when already present (Xano `_latest`); fill from master
 * otherwise (Postgres). Always coerce required strings so search/sort never see undefined.
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
  return base
}

/**
 * Apply {@link overlayMasterOwnedListFields} to each version row, joining masters
 * by `mba_number`. Rows without a master are kept (empty master-owned strings).
 * Does not rewrite `version_number` or other version-owned fields.
 */
export function applyMasterOwnedOverlayByMba(
  versionRows: Array<Record<string, unknown> | null | undefined>,
  masters: Array<Record<string, unknown> | null | undefined>,
): Record<string, unknown>[] {
  const masterMap = new Map<string, Record<string, unknown>>()
  for (const master of masters) {
    const mba = master?.mba_number
    if (mba == null || String(mba).trim() === "") continue
    masterMap.set(String(mba), master as Record<string, unknown>)
  }

  return versionRows.map((row) => {
    const mba = row?.mba_number
    const master =
      mba != null && String(mba).trim() !== ""
        ? masterMap.get(String(mba))
        : undefined
    return overlayMasterOwnedListFields(row, master)
  })
}
