import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import type { Connection } from "snowflake-sdk"

import {
  DELETE_DELIVERY_RANGE_SQL,
  INSERT_DELIVERY_SQL,
  INSERT_FILE_LINE_SQL,
  INSERT_INGEST_LOG_SQL,
  SELECT_LOADED_DUPLICATE_SQL,
  SELECT_SOURCE_MAP_SQL,
  assertNoRawUpdate,
} from "../sql"
import { createPartnerSnowflakeWriter } from "../snowflakeWriter"
import type { PartnerDeliveryRow } from "../types"

const ALL_SQL = [
  SELECT_SOURCE_MAP_SQL,
  SELECT_LOADED_DUPLICATE_SQL,
  INSERT_FILE_LINE_SQL(3),
  INSERT_INGEST_LOG_SQL,
  DELETE_DELIVERY_RANGE_SQL,
  INSERT_DELIVERY_SQL(2),
]

test("partner ingest SQL never issues UPDATE against RAW", () => {
  for (const sql of ALL_SQL) {
    assert.doesNotThrow(() => assertNoRawUpdate(sql))
    assert.equal(/\bUPDATE\b/i.test(sql), false)
  }
})

test("range replace is BEGIN / DELETE / INSERT / COMMIT on one session", async () => {
  const statements: string[] = []
  const writer = createPartnerSnowflakeWriter({
    query: async () => [],
    withSession: async (fn) => fn({} as Connection),
    executeVoid: async (_session, sqlText) => {
      statements.push(sqlText)
    },
  })

  const row: PartnerDeliveryRow = {
    reportDate: "2026-09-13",
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

  await writer.writeLoadAndLog({
    load: {
      source: "Channel Factory",
      minDate: "2026-09-13",
      maxDate: "2026-09-13",
      rows: [row],
      sourceFile: "channel-factory/2026-09-14/id_cf.xlsx",
    },
    log: {
      sourceSlug: "channel-factory",
      internetMessageId: "<id>",
      attachmentName: "cf.xlsx",
      attachmentSha256: "abc",
      sourceFile: "channel-factory/2026-09-14/id_cf.xlsx",
      senderAddress: "noreply@datorama.com",
      receivedAt: "2026-09-14T08:06:00Z",
      bytes: 1,
      lineCount: 6,
      parsedRowCount: 1,
      status: "loaded",
      errorText: null,
    },
  })

  const verbs = statements.map((s) => s.trim().split(/\s+/)[0]!.toUpperCase())
  assert.deepEqual(verbs, ["BEGIN", "DELETE", "INSERT", "COMMIT", "INSERT"])
  assert.equal(statements.some((s) => /\bUPDATE\b/i.test(s)), false)
  assert.ok(
    statements.some((s) =>
      /DELETE FROM ASSEMBLEDVIEW\.RAW\.PARTNER_DELIVERY_DAILY/.test(s)
    )
  )
})

test("parse_failed path inserts ingest log and never deletes daily", async () => {
  const statements: string[] = []
  const writer = createPartnerSnowflakeWriter({
    query: async () => [],
    withSession: async (fn) => fn({} as Connection),
    executeVoid: async (_session, sqlText) => {
      statements.push(sqlText)
    },
  })
  await writer.writeLoadAndLog({
    load: null,
    log: {
      sourceSlug: "channel-factory",
      internetMessageId: "<id>",
      attachmentName: "cf.xlsx",
      attachmentSha256: "abc",
      sourceFile: "channel-factory/2026-09-14/id_cf.xlsx",
      senderAddress: "noreply@datorama.com",
      receivedAt: "2026-09-14T08:06:00Z",
      bytes: 1,
      lineCount: 6,
      parsedRowCount: 0,
      status: "parse_failed",
      errorText: "T4: inverted",
    },
  })
  assert.equal(statements.length, 1)
  assert.match(statements[0] ?? "", /PARTNER_FILE_INGEST_LOG/)
  assert.equal(statements.some((s) => /\bDELETE\b/i.test(s)), false)
})

test("cron route is secret-gated and never deletes mail", () => {
  const route = readFileSync(
    path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
      "..",
      "..",
      "app",
      "api",
      "cron",
      "partner-ingest",
      "route.ts"
    ),
    "utf8"
  )
  assert.match(route, /assertCronSecret/)
  assert.match(route, /maxDuration = 300/)
  assert.equal(/\bmethod:\s*"DELETE"/i.test(route), false)
})
