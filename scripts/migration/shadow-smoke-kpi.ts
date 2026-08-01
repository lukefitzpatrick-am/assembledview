/**
 * One-shot shadow smoke for campaign/client/publisher KPI (T2b verify).
 * Avoids importing `server-only` modules — mirrors the reader compare path.
 * Usage: npx tsx scripts/migration/shadow-smoke-kpi.ts
 */
import { loadEnvLocal } from "./_shared"
import { getDb, schema } from "@/db"
import {
  __resetShadowDiffStoreForTests,
  compareReferenceRows,
  recordShadowDiff,
  summarizeShadowDiffs,
} from "@/lib/data/shadowDiff"
import { coerceNumericStringsToNumbers, toApiRow } from "@/lib/data/toApiRow"
import { fetchAllXanoPagesWithCompleteness } from "@/lib/api/xanoPagination"
import { xanoUrl } from "@/lib/api/xano"

function mapKpi(row: Record<string, unknown>) {
  return coerceNumericStringsToNumbers(toApiRow(row))
}

async function main() {
  loadEnvLocal()
  __resetShadowDiffStoreForTests()

  const db = getDb()
  const [
    { items: xanoCampaign, complete: campaignComplete },
    { items: xanoClient, complete: clientComplete },
    { items: xanoPublisher, complete: publisherComplete },
    pgCampaign,
    pgClient,
    pgPublisher,
  ] = await Promise.all([
    fetchAllXanoPagesWithCompleteness(
      xanoUrl("campaign_kpi", "XANO_CLIENTS_BASE_URL"),
      {},
      "campaign_kpi",
      200,
      100
    ),
    fetchAllXanoPagesWithCompleteness(
      xanoUrl("client_kpi", "XANO_CLIENTS_BASE_URL"),
      {},
      "client_kpi",
      200,
      100
    ),
    fetchAllXanoPagesWithCompleteness(
      xanoUrl("publisher_kpi", "XANO_PUBLISHERS_BASE_URL"),
      {},
      "publisher_kpi",
      200,
      100
    ),
    db.select().from(schema.campaignKpi),
    db.select().from(schema.clientKpi),
    db.select().from(schema.publisherKpi),
  ])

  const compareOpts = {
    domain: "kpi" as const,
    postgresKeysOnly: true,
    kpiNumericCompare: true,
  }

  const campaignEvent = compareReferenceRows(
    "campaign_kpi",
    xanoCampaign,
    pgCampaign.map((r) => mapKpi(r as Record<string, unknown>)),
    compareOpts
  )
  recordShadowDiff(campaignEvent)

  const clientEvent = compareReferenceRows(
    "client_kpi",
    xanoClient,
    pgClient.map((r) => mapKpi(r as Record<string, unknown>)),
    compareOpts
  )
  recordShadowDiff(clientEvent)

  const publisherEvent = compareReferenceRows(
    "publisher_kpi",
    xanoPublisher,
    pgPublisher.map((r) => mapKpi(r as Record<string, unknown>)),
    compareOpts
  )
  recordShadowDiff(publisherEvent)

  console.log(
    JSON.stringify(
      {
        epsilon: { moneyEpsCents: 1, rateEpsilon: 1e-6 },
        paginationComplete: {
          campaign_kpi: campaignComplete,
          client_kpi: clientComplete,
          publisher_kpi: publisherComplete,
        },
        counts: {
          xano: {
            campaign_kpi: xanoCampaign.length,
            client_kpi: xanoClient.length,
            publisher_kpi: xanoPublisher.length,
          },
          postgres: {
            campaign_kpi: pgCampaign.length,
            client_kpi: pgClient.length,
            publisher_kpi: pgPublisher.length,
          },
        },
        campaign_kpi: {
          missingInPostgres: campaignEvent.missingInPostgres.length,
          missingInXano: campaignEvent.missingInXano.length,
          rowsWithFieldDiffs: campaignEvent.fieldDiffs.length,
          sample: campaignEvent.fieldDiffs.slice(0, 5),
        },
        client_kpi: {
          missingInPostgres: clientEvent.missingInPostgres.length,
          missingInXano: clientEvent.missingInXano.length,
          rowsWithFieldDiffs: clientEvent.fieldDiffs.length,
          sample: clientEvent.fieldDiffs.slice(0, 5),
        },
        publisher_kpi: {
          missingInPostgres: publisherEvent.missingInPostgres.length,
          missingInXano: publisherEvent.missingInXano.length,
          rowsWithFieldDiffs: publisherEvent.fieldDiffs.length,
          sample: publisherEvent.fieldDiffs.slice(0, 5),
        },
        summary: summarizeShadowDiffs(),
      },
      null,
      2
    )
  )
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
