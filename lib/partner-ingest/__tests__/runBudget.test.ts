import assert from "node:assert/strict"
import test from "node:test"

import { runPartnerIngest } from "../runPartnerIngest"
import type { PartnerMailboxPort, PartnerMailMessage, PartnerSnowflakePort } from "../runPartnerIngest"
import { DELIVERY_INSERT_BATCH, LINE_INSERT_BATCH } from "../sql"
import { createPartnerSnowflakeWriter } from "../snowflakeWriter"
import type { PartnerDeliveryRow } from "../types"

function message(n: number): PartnerMailMessage {
  return {
    id: `msg-${n}`,
    internetMessageId: `<m${n}@example.com>`,
    receivedDateTime: `2026-10-1${n}T22:00:00Z`,
    senderAddress: "someone@example.com",
    subject: `Not a partner file ${n}`,
  }
}

function inbox(count: number): PartnerMailboxPort & { moved: string[] } {
  const moved: string[] = []
  return {
    moved,
    async listInboxMessages() {
      // Newest first, so the runner's oldest-first sort is exercised.
      return Array.from({ length: count }, (_, i) => message(count - i))
    },
    async getAttachments() {
      return []
    },
    async moveMessage(id) {
      moved.push(id)
    },
  }
}

function store(): PartnerSnowflakePort {
  return {
    async loadSourceMap() {
      return []
    },
    async hasLoadedDuplicate() {
      return false
    },
    async insertRawLines() {},
    async writeLoadAndLog() {},
  }
}

test("budget: unrecognised messages after the deadline stay in the inbox, oldest first", async () => {
  let clock = 0
  const box = inbox(4)
  const summary = await runPartnerIngest({
    mailbox: box,
    snowflake: store(),
    deadlineAt: 100,
    // Each message costs 60 ms of the budget.
    now: () => {
      const at = clock
      clock += 60
      return at
    },
  })
  assert.deepEqual(box.moved, ["msg-1", "msg-2"])
  assert.equal(summary.unrecognised, 2)
  assert.equal(summary.deferred, 2)
})

test("budget: no deadline processes every message", async () => {
  const box = inbox(3)
  const summary = await runPartnerIngest({ mailbox: box, snowflake: store() })
  assert.deepEqual(box.moved, ["msg-1", "msg-2", "msg-3"])
  assert.equal(summary.deferred, 0)
})

function deliveryRow(i: number): PartnerDeliveryRow {
  return {
    reportDate: `2026-10-${String((i % 20) + 1).padStart(2, "0")}`,
    partnerAdvertiserId: "adv",
    partnerCampaignName: "camp",
    partnerLineItemName: "line",
    avLineItemId: null,
    impressions: 10,
    clicks: 1,
    videoViews: 0,
    videoQ25: 0,
    videoQ50: 0,
    videoQ75: 0,
    completedViews: 0,
    rateQ25: 0,
    rateQ50: 0,
    rateQ75: 0,
    rateFullyPlayed: 0,
  }
}

test("a Vistar-sized file takes about 100 round trips, not 500", async () => {
  const statements: string[] = []
  const writer = createPartnerSnowflakeWriter({
    query: async () => [],
    withSession: async (fn) => fn({} as never),
    executeVoid: async (_session, sql) => {
      statements.push(sql.trimStart().split(/\s+/).slice(0, 3).join(" "))
    },
  })
  const n = 13_534
  await writer.insertRawLines({
    sourceFile: "vistar/x.csv",
    lines: Array.from({ length: n }, (_, i) => ({ fileRow: i + 1, rawLine: `line ${i}` })),
  })
  const lineInserts = statements.length
  assert.equal(lineInserts, Math.ceil(n / LINE_INSERT_BATCH))
  assert.equal(lineInserts, 28)

  statements.length = 0
  await writer.writeLoadAndLog({
    load: {
      source: "Vistar",
      minDate: "2026-10-01",
      maxDate: "2026-10-20",
      loadMode: "range_replace",
      rows: Array.from({ length: n }, (_, i) => deliveryRow(i)),
      sourceFile: "vistar/x.csv",
    },
    log: {
      sourceSlug: "vistar",
      internetMessageId: "<v@example.com>",
      attachmentName: "x.csv",
      attachmentSha256: "0",
      sourceFile: "vistar/x.csv",
      senderAddress: null,
      receivedAt: null,
      bytes: 1,
      lineCount: n,
      parsedRowCount: n,
      status: "loaded",
      errorText: null,
    },
  })
  const deliveryInserts = statements.filter((s) => s === "INSERT INTO ASSEMBLEDVIEW.RAW.PARTNER_DELIVERY_DAILY").length
  assert.equal(deliveryInserts, Math.ceil(n / DELIVERY_INSERT_BATCH))
  assert.equal(deliveryInserts, 68)
  assert.equal(statements[0], "BEGIN")
  assert.ok(statements.includes("COMMIT"))
})
