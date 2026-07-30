/**
 * One-shot shadow smoke for publishers + clients (T2a verify).
 * Avoids importing `server-only` modules — mirrors the reader compare path.
 * Usage: npx tsx scripts/migration/shadow-smoke-publishers-clients.ts
 */
import { loadEnvLocal } from "./_shared"
import { getDb, schema } from "@/db"
import {
  __resetShadowDiffStoreForTests,
  compareReferenceRows,
  recordShadowDiff,
  summarizeShadowDiffs,
} from "@/lib/data/shadowDiff"
import {
  coerceNumericStringsToNumbers,
  toApiRow,
} from "@/lib/data/toApiRow"
import { xanoAuthHeader, xanoUrl } from "@/lib/api/xano"
import { getXanoClientsCollectionUrl } from "@/lib/api/xanoClients"

function mapPublisher(row: Record<string, unknown>) {
  return coerceNumericStringsToNumbers(toApiRow(row))
}

function mapClient(row: Record<string, unknown>) {
  return coerceNumericStringsToNumbers(toApiRow(row), {
    keepAsText: new Set(["abn"]),
  })
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { Accept: "application/json", ...xanoAuthHeader() },
  })
  if (!res.ok) throw new Error(`${url} → ${res.status}`)
  return res.json()
}

async function main() {
  loadEnvLocal()
  __resetShadowDiffStoreForTests()

  const db = getDb()
  const [xanoPubs, xanoClients, pgPubs, pgClients] = await Promise.all([
    fetchJson(xanoUrl("get_publishers", "XANO_PUBLISHERS_BASE_URL")),
    fetchJson(getXanoClientsCollectionUrl()),
    db.select().from(schema.publishers),
    db.select().from(schema.clients),
  ])

  const pubEvent = compareReferenceRows(
    "publishers",
    xanoPubs,
    pgPubs.map((r) => mapPublisher(r as Record<string, unknown>)),
    { domain: "publishers", postgresKeysOnly: true }
  )
  recordShadowDiff(pubEvent)

  const clientEvent = compareReferenceRows(
    "clients",
    xanoClients,
    pgClients.map((r) => mapClient(r as Record<string, unknown>)),
    { domain: "clients", postgresKeysOnly: true }
  )
  recordShadowDiff(clientEvent)

  console.log(
    JSON.stringify(
      {
        xanoPublisherCount: Array.isArray(xanoPubs) ? xanoPubs.length : null,
        xanoClientCount: Array.isArray(xanoClients) ? xanoClients.length : null,
        pgPublisherCount: pgPubs.length,
        pgClientCount: pgClients.length,
        publishers: {
          missingInPostgres: pubEvent.missingInPostgres.length,
          missingInXano: pubEvent.missingInXano.length,
          rowsWithFieldDiffs: pubEvent.fieldDiffs.length,
          sample: pubEvent.fieldDiffs.slice(0, 5),
        },
        clients: {
          missingInPostgres: clientEvent.missingInPostgres.length,
          missingInXano: clientEvent.missingInXano.length,
          rowsWithFieldDiffs: clientEvent.fieldDiffs.length,
          sample: clientEvent.fieldDiffs.slice(0, 5),
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
