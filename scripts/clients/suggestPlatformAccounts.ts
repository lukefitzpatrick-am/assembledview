/**
 * Print suggested CM360 / DV360 advertiser links. Reads clients and
 * MART.V_PLATFORM_ADVERTISERS. Does not write to Postgres or Snowflake.
 *
 *   npx tsx scripts/clients/suggestPlatformAccounts.ts
 */
import { closeDb, getDb } from "@/db"
import { clients } from "@/db/schema"
import {
  fetchPlatformAdvertisersUncached,
  type PlatformAdvertiser,
} from "@/lib/clients/platformAdvertisers"
import { isMissingAdvertiserView } from "@/lib/clients/platformAccounts"
import { formatSuggestionCsv, suggestPlatformAccounts } from "@/lib/clients/suggestPlatformAccounts"

async function advertisersFor(platform: "cm360" | "dv360"): Promise<PlatformAdvertiser[]> {
  return fetchPlatformAdvertisersUncached(platform)
}

async function main() {
  let cm360: PlatformAdvertiser[]
  let dv360: PlatformAdvertiser[]
  try {
    ;[cm360, dv360] = await Promise.all([advertisersFor("cm360"), advertisersFor("dv360")])
  } catch (err) {
    if (isMissingAdvertiserView(err)) {
      console.error("Advertiser list not set up yet. Run sql/snowflake/mart/views/v_platform_advertisers.sql first.")
      process.exitCode = 1
      return
    }
    throw err
  }

  const db = getDb()
  const clientRows = await db
    .select({
      clientName: clients.mpClientName,
      mbaidentifier: clients.mbaidentifier,
    })
    .from(clients)

  const suggestions = suggestPlatformAccounts(
    clientRows.flatMap((row) => {
      const clientName = row.clientName?.trim() ?? ""
      const mbaidentifier = row.mbaidentifier?.trim() ?? ""
      if (!clientName || !mbaidentifier) return []
      return [{ clientName, mbaidentifier }]
    }),
    [
      ...cm360.map((row) => ({ platform: "cm360" as const, advertiserName: row.name })),
      ...dv360.map((row) => ({ platform: "dv360" as const, advertiserName: row.name })),
    ],
  )

  process.stdout.write(formatSuggestionCsv(suggestions))
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
  .finally(() => closeDb())
