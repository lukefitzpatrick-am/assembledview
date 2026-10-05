import "server-only"

import {
  readPlanMasterByMba,
  readPlanMasters,
  readPlanVersionsByMba,
  readPlanVersionsForMbas,
  readPublishedPointerPlanVersions,
} from "@/lib/data/readMediaPlans"
import { mbaJoinKey } from "@/lib/mediaplan/mbaNumber"
import { publishedVersionPointerIdFromMaster } from "@/lib/mediaplan/publishedVersionGuard"
import { isVersionPublished } from "@/lib/mediaplan/versionPublication"

/**
 * Postgres versions have no client name. Dashboards still filter and label
 * campaigns from `mp_client_name` / `client_id`, which live on the master.
 */
export function stampVersionClientsFromMasters(
  versions: Array<Record<string, unknown>>,
  masters: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  const byMba = new Map<string, { name: string; clientId: unknown }>()
  for (const master of masters) {
    const key = mbaJoinKey(master.mba_number)
    if (!key) continue
    const name = String(master.mp_client_name ?? "").trim()
    byMba.set(key, { name, clientId: master.client_id ?? null })
  }
  for (const version of versions) {
    const versionKey = mbaJoinKey(version.mba_number)
    if (!versionKey) continue
    const hit = byMba.get(versionKey)
    if (!hit) continue
    if (!String(version.mp_client_name ?? "").trim() && hit.name) {
      version.mp_client_name = hit.name
    }
    if (
      (version.client_id == null || version.client_id === "") &&
      hit.clientId != null
    ) {
      version.client_id = hit.clientId
    }
  }
  return versions
}

/** Commercial status lives on the master. Version rows keep a historical copy. */
export function applyMasterCampaignStatus(
  versions: Array<Record<string, unknown>>,
  masters: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  const byMba = new Map<string, string>()
  for (const master of masters) {
    const key = mbaJoinKey(master?.mba_number)
    if (!key) continue
    const status = String(master?.campaign_status ?? "").trim()
    if (!status) continue
    byMba.set(key, status)
  }
  for (const version of versions) {
    const key = mbaJoinKey(version.mba_number)
    const status = key ? byMba.get(key) : undefined
    if (status) version.campaign_status = status
  }
  return versions
}

function positiveClientId(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.trunc(n)
}

/**
 * Masters whose `client_id` is in the set, plus every version of those MBAs
 * (schedules included). Empty set does not query versions.
 */
export async function loadClientDashboardPlanRows(
  clientIds: ReadonlySet<number>,
): Promise<{
  masters: Array<Record<string, unknown>>
  versions: Array<Record<string, unknown>>
}> {
  if (clientIds.size === 0) return { masters: [], versions: [] }
  const masters = (await readPlanMasters()).filter((master) => {
    const id = positiveClientId(master.client_id)
    return id != null && clientIds.has(id)
  })
  const versions = await readPlanVersionsForMbas(
    masters.map((master) => String(master.mba_number ?? "")),
    { includeSchedules: true },
  )
  stampVersionClientsFromMasters(versions, masters)
  applyMasterCampaignStatus(versions, masters)
  return { masters, versions }
}

/**
 * One published cut per master: `published_version_id` whose row has `published_at`.
 * Schedules stay on the row. Used by publisher and finance dashboards.
 */
export async function loadPublishedDashboardPlanRows(): Promise<{
  masters: Array<Record<string, unknown>>
  versions: Array<Record<string, unknown>>
}> {
  const [masters, versions] = await Promise.all([
    readPlanMasters(),
    readPublishedPointerPlanVersions(),
  ])
  stampVersionClientsFromMasters(versions, masters)
  applyMasterCampaignStatus(versions, masters)
  return { masters, versions }
}

/** Watermark for the dashboard picker: the stamped pointer's version_number only. */
export function publishedCutByMba(
  masters: Array<Record<string, unknown>>,
  versions: Array<Record<string, unknown>>,
): {
  publishedByMba: Map<string, number>
  publishedVersionIdByMba: Map<string, number | null>
} {
  const versionById = new Map<number, Record<string, unknown>>()
  for (const version of versions) {
    const id = Number(version.id)
    if (Number.isFinite(id) && id > 0) versionById.set(id, version)
  }
  const publishedByMba = new Map<string, number>()
  const publishedVersionIdByMba = new Map<string, number | null>()
  for (const master of masters) {
    const key = mbaJoinKey(master.mba_number)
    if (!key) continue
    const pointer = publishedVersionPointerIdFromMaster(master)
    if (pointer == null) {
      publishedVersionIdByMba.set(key, null)
      continue
    }
    const row = versionById.get(pointer)
    if (!row || !isVersionPublished(row)) {
      publishedVersionIdByMba.set(key, null)
      continue
    }
    const vn = Number(row.version_number)
    if (Number.isFinite(vn) && vn > 0) publishedByMba.set(key, vn)
    publishedVersionIdByMba.set(key, pointer)
  }
  return { publishedByMba, publishedVersionIdByMba }
}

export async function loadDashboardVersionsForMba(
  mbaNumber: string,
): Promise<Array<Record<string, unknown>>> {
  const [versions, master] = await Promise.all([
    readPlanVersionsByMba(mbaNumber),
    readPlanMasterByMba(mbaNumber),
  ])
  return stampVersionClientsFromMasters(versions, master ? [master] : [])
}
