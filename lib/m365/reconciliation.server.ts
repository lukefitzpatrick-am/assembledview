import "server-only"

import { getDb, schema } from "@/db"
import { fetchClientsFromPostgres } from "@/lib/data/readClients"
import { isM365ProvisioningEnabled } from "@/lib/m365/featureFlag"
import {
  buildM365ReconciliationReport,
  type M365ReconciliationReport,
  type PlanMbaInput,
  type ReconciliationClientInput,
} from "@/lib/m365/reconciliation"

function mapClient(row: Record<string, unknown>): ReconciliationClientInput {
  return {
    id: Number(row.id),
    mp_client_name: (row.mp_client_name as string | null | undefined) ?? null,
    mbaidentifier: (row.mbaidentifier as string | null | undefined) ?? null,
    slug: (row.slug as string | null | undefined) ?? null,
    sharepoint_site_url:
      (row.sharepoint_site_url as string | null | undefined) ?? null,
    teams_group_id: (row.teams_group_id as string | null | undefined) ?? null,
    m365_is_anchor: row.m365_is_anchor === true,
  }
}

/**
 * Read-only M365 reconciliation payload (M4 skeleton).
 * Always loads clients + masters from Postgres — no Graph writes.
 */
export async function loadM365ReconciliationReport(): Promise<M365ReconciliationReport> {
  const db = getDb()
  const [clientRows, masterRows] = await Promise.all([
    fetchClientsFromPostgres(),
    db
      .select({
        id: schema.mediaPlanMasters.id,
        mbaNumber: schema.mediaPlanMasters.mbaNumber,
        mpClientName: schema.mediaPlanMasters.mpClientName,
        campaignName: schema.mediaPlanMasters.campaignName,
        clientId: schema.mediaPlanMasters.clientId,
      })
      .from(schema.mediaPlanMasters),
  ])

  const clients = clientRows.map((r) => mapClient(r))
  const plans: PlanMbaInput[] = masterRows.map((r) => ({
    id: r.id,
    mba_number: r.mbaNumber,
    mp_client_name: r.mpClientName,
    campaign_name: r.campaignName,
    client_id: r.clientId,
  }))

  return buildM365ReconciliationReport(clients, plans, {
    provisioningEnabled: isM365ProvisioningEnabled(),
  })
}
