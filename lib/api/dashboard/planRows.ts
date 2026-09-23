import "server-only"

import {
  readPlanMasterByMba,
  readPlanMasters,
  readPlanVersions,
  readPlanVersionsByMba,
} from "@/lib/data/readMediaPlans"
import { mbaJoinKey } from "@/lib/mediaplan/mbaNumber"

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

let dashboardPlanRowsInFlight: Promise<{
  masters: Array<Record<string, unknown>>
  versions: Array<Record<string, unknown>>
}> | null = null

export function loadDashboardPlanRows(): Promise<{
  masters: Array<Record<string, unknown>>
  versions: Array<Record<string, unknown>>
}> {
  if (!dashboardPlanRowsInFlight) {
    dashboardPlanRowsInFlight = (async () => {
      const [masters, versions] = await Promise.all([
        readPlanMasters(),
        readPlanVersions(),
      ])
      stampVersionClientsFromMasters(versions, masters)
      return { masters, versions }
    })().finally(() => {
      dashboardPlanRowsInFlight = null
    })
  }
  return dashboardPlanRowsInFlight
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
