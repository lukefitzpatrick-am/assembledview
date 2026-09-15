import assert from "node:assert/strict"
import test from "node:test"
import type { Connection } from "snowflake-sdk"

import { PartnerIngestError } from "../errors"
import { createPartnerSnowflakeWriter } from "../snowflakeWriter"
import { resolveLoadMode } from "../sql"
import type { PartnerIngestLogRow } from "../runPartnerIngest"
import type { PartnerDeliveryRow } from "../types"

function row(reportDate: string): PartnerDeliveryRow {
  return {
    reportDate,
    partnerAdvertiserId: "1",
    partnerCampaignName: "C",
    partnerLineItemName: "buy",
    avLineItemId: "bicau002pv4",
    impressions: 10,
    clicks: 0,
    videoViews: 8,
    videoQ25: 9,
    videoQ50: 8,
    videoQ75: 7,
    completedViews: 6,
    rateQ25: 0.9,
    rateQ50: 0.8,
    rateQ75: 0.7,
    rateFullyPlayed: 0.6,
  }
}

const LOG: PartnerIngestLogRow = {
  sourceSlug: "vistar",
  internetMessageId: "<id>",
  attachmentName: "exchange.csv",
  attachmentSha256: "abc",
  sourceFile: "vistar/2026-09-15/id_exchange.csv",
  senderAddress: "reports@vistarmedia.com",
  receivedAt: "2026-09-15T04:46:00Z",
  bytes: 1,
  lineCount: 209,
  parsedRowCount: 2,
  status: "loaded",
  errorText: null,
}

async function statementsFor(loadMode: string | null): Promise<{ sql: string; binds: unknown[] }[]> {
  const calls: { sql: string; binds: unknown[] }[] = []
  const writer = createPartnerSnowflakeWriter({
    query: async () => [],
    withSession: async (fn) => fn({} as Connection),
    executeVoid: async (_session, sqlText, binds = []) => {
      calls.push({ sql: sqlText, binds })
    },
  })
  await writer.writeLoadAndLog({
    load: {
      source: "Vistar",
      minDate: "2026-02-02",
      maxDate: "2026-02-06",
      loadMode,
      rows: [row("2026-02-02"), row("2026-02-06"), row("2026-02-02")],
      sourceFile: LOG.sourceFile,
    },
    log: LOG,
  })
  return calls
}

test("resolveLoadMode accepts the three modes and defaults to range replace", () => {
  assert.equal(resolveLoadMode(null), "range_replace")
  assert.equal(resolveLoadMode(""), "range_replace")
  assert.equal(resolveLoadMode("range_replace"), "range_replace")
  assert.equal(resolveLoadMode("day_replace"), "day_replace")
  assert.equal(resolveLoadMode("append"), "append")
  assert.equal(resolveLoadMode("upsert"), null)
})

test("range_replace deletes the file's date range", async () => {
  const calls = await statementsFor("range_replace")
  const verbs = calls.map((c) => c.sql.trim().split(/\s+/)[0]!.toUpperCase())
  assert.deepEqual(verbs, ["BEGIN", "DELETE", "INSERT", "COMMIT", "INSERT"])
  assert.match(calls[1]!.sql, /WHERE SOURCE = \?\s+AND REPORT_DATE BETWEEN \? AND \?/)
  assert.deepEqual(calls[1]!.binds, ["Vistar", "2026-02-02", "2026-02-06"])
})

test("day_replace deletes only the distinct dates in the file", async () => {
  const calls = await statementsFor("day_replace")
  const verbs = calls.map((c) => c.sql.trim().split(/\s+/)[0]!.toUpperCase())
  assert.deepEqual(verbs, ["BEGIN", "DELETE", "INSERT", "COMMIT", "INSERT"])
  assert.match(calls[1]!.sql, /WHERE SOURCE = \?\s+AND REPORT_DATE IN \(\?, \?\)/)
  assert.deepEqual(calls[1]!.binds, ["Vistar", "2026-02-02", "2026-02-06"])
})

test("append inserts without deleting", async () => {
  const calls = await statementsFor("append")
  const verbs = calls.map((c) => c.sql.trim().split(/\s+/)[0]!.toUpperCase())
  assert.deepEqual(verbs, ["BEGIN", "INSERT", "COMMIT", "INSERT"])
  assert.equal(calls.some((c) => /\bDELETE\b/i.test(c.sql)), false)
})

test("an unknown LOAD_MODE refuses to load", async () => {
  await assert.rejects(
    () => statementsFor("merge_into"),
    (err: unknown) =>
      err instanceof PartnerIngestError && /unknown LOAD_MODE "merge_into"/.test(err.message)
  )
})
