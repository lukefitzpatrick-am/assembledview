import assert from "node:assert/strict"
import test from "node:test"

import ExcelJS from "exceljs"

import { CHANNEL_FACTORY_EXPECTED_HEADER } from "../columnNames"
import { runPartnerIngest } from "../runPartnerIngest"
import type {
  PartnerIngestLogRow,
  PartnerMailboxPort,
  PartnerSnowflakePort,
} from "../runPartnerIngest"
import type { PartnerDeliveryRow, PartnerRawLine, PartnerSourceMapRow } from "../types"

const CF_MAP: PartnerSourceMapRow = {
  senderDomain: "datorama.com",
  subjectPattern: "%1248052%",
  sourceSlug: "channel-factory",
  sourceLabel: "Channel Factory",
  isActive: true,
  expectedHeader: CHANNEL_FACTORY_EXPECTED_HEADER,
  headerRowHint: 5,
  maxStaleDays: 3,
  loadMode: "range_replace",
}

const MATCHING_MESSAGE = {
  id: "msg-1",
  internetMessageId: "<cf-14sep@datorama.com>",
  receivedDateTime: "2026-09-14T08:06:00Z",
  senderAddress: "noreply@datorama.com",
  subject: "Datorama Report 1248052 Channel Factory",
}

async function xlsx(rows: Array<Record<string, unknown>>, header = CHANNEL_FACTORY_EXPECTED_HEADER.split("|")): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet("Report")
  ws.addRow(["Datorama"])
  ws.addRow(["Report 1248052"])
  ws.addRow(["Channel Factory"])
  ws.addRow(["Generated"])
  ws.addRow(header)
  for (const row of rows) {
    ws.addRow([
      row.day,
      row.advertiser,
      row.campaign,
      row.mediaBuy,
      row.impressions,
      row.clicks,
      row.videoViews,
      row.rateQ25,
      row.rateQ50,
      row.rateQ75,
      row.rateFull,
    ])
  }
  return Buffer.from(await wb.xlsx.writeBuffer())
}

function validRow(overrides: Record<string, unknown> = {}) {
  return {
    day: "2026-09-13",
    advertiser: "adv-1",
    campaign: "Camp",
    mediaBuy: "CF12_AT1_P18-99_Birthday Hero_BICAU002PV4",
    impressions: 1000,
    clicks: 1,
    videoViews: 600,
    rateQ25: 0.9,
    rateQ50: 0.8,
    rateQ75: 0.7,
    rateFull: 0.6,
    ...overrides,
  }
}

function mailbox(atts: { name: string; bytes: Buffer; contentType?: string; isInline?: boolean }[]): PartnerMailboxPort & {
  moves: string[]
} {
  const moves: string[] = []
  return {
    moves,
    async listInboxMessages() {
      return [MATCHING_MESSAGE]
    },
    async getAttachments() {
      return atts.map((a, i) => ({
        id: `att-${i}`,
        name: a.name,
        contentType: a.contentType ?? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        isInline: a.isInline ?? false,
        bytes: a.bytes,
      }))
    },
    async moveMessage(_id, folder) {
      moves.push(folder)
    },
  }
}

function snowflakeStub(opts?: {
  duplicate?: boolean
  map?: PartnerSourceMapRow[]
  maxReportDates?: Record<string, string | null>
}): PartnerSnowflakePort & {
  events: string[]
  lines: PartnerRawLine[]
  lastLoad: PartnerDeliveryRow[] | null
  loadModes: (string | null | undefined)[]
  logs: PartnerIngestLogRow[]
} {
  const events: string[] = []
  const lines: PartnerRawLine[] = []
  const logs: PartnerIngestLogRow[] = []
  const loadModes: (string | null | undefined)[] = []
  const state: {
    lastLoad: PartnerDeliveryRow[] | null
  } = { lastLoad: null }
  return {
    events,
    lines,
    get lastLoad() {
      return state.lastLoad
    },
    loadModes,
    logs,
    async loadSourceMap() {
      return opts?.map ?? [CF_MAP]
    },
    async hasLoadedDuplicate() {
      return opts?.duplicate === true
    },
    async insertRawLines(input) {
      events.push("lines")
      lines.push(...input.lines)
    },
    async writeLoadAndLog(input) {
      events.push(input.load ? "load" : "noload")
      state.lastLoad = input.load ? input.load.rows : null
      if (input.load) loadModes.push(input.load.loadMode)
      logs.push(input.log)
    },
    async loadMaxReportDates(sourceLabels) {
      const out: Record<string, string | null> = {}
      for (const label of sourceLabels) {
        out[label] = opts?.maxReportDates?.[label] ?? null
      }
      return out
    },
  }
}

test("unrecognised sender is logged and moved, not parsed", async () => {
  const sf = snowflakeStub()
  const box = mailbox([])
  const other = {
    ...box,
    async listInboxMessages() {
      return [
        {
          ...MATCHING_MESSAGE,
          senderAddress: "noreply@datorama.com",
          subject: "Someone else's Datorama report 9999999",
        },
      ]
    },
  }
  const summary = await runPartnerIngest({ mailbox: other, snowflake: sf })
  assert.equal(summary.unrecognised, 1)
  assert.equal(summary.filesSeen, 0)
  assert.equal(sf.events.includes("lines"), false)
  assert.equal(sf.logs[0]?.status, "unrecognised")
  assert.deepEqual(box.moves, ["Unrecognised"])
})

test("loaded duplicate skips without rewriting lines", async () => {
  const bytes = await xlsx([validRow()])
  const sf = snowflakeStub({ duplicate: true })
  const box = mailbox([{ name: "cf.xlsx", bytes }])
  const summary = await runPartnerIngest({ mailbox: box, snowflake: sf })
  assert.equal(summary.skipped, 1)
  assert.equal(sf.events.includes("lines"), false)
  assert.equal(sf.logs[0]?.status, "skipped_duplicate")
  assert.equal(sf.lastLoad, null)
})

test("parse_failed writes raw lines and does not load daily", async () => {
  const bytes = await xlsx([
    validRow({ rateQ25: 0.4, rateQ50: 0.5, rateQ75: 0.6, rateFull: 0.9 }),
  ])
  const sf = snowflakeStub()
  const box = mailbox([{ name: "cf.xlsx", bytes }])
  const summary = await runPartnerIngest({ mailbox: box, snowflake: sf })
  assert.equal(summary.failed, 1)
  assert.equal(sf.events[0], "lines")
  assert.ok(sf.lines.length > 0)
  assert.equal(sf.lastLoad, null)
  assert.equal(sf.logs[0]?.status, "parse_failed")
  assert.deepEqual(box.moves, ["Failed"])
})

test("successful load inserts lines first then range-replaces daily including uncoded rows", async () => {
  const bytes = await xlsx([
    validRow(),
    validRow({
      mediaBuy: "CF12_AT1_P25-64 (Female List)",
      impressions: 10,
      videoViews: 6,
      rateQ25: 0.9,
      rateQ50: 0.8,
      rateQ75: 0.7,
      rateFull: 0.6,
    }),
  ])
  const sf = snowflakeStub()
  const box = mailbox([{ name: "cf.xlsx", bytes }])
  const summary = await runPartnerIngest({ mailbox: box, snowflake: sf })
  assert.equal(summary.loaded, 1)
  assert.equal(summary.rowsParsed, 2)
  assert.equal(summary.rowsWithNullCode, 1)
  assert.equal(sf.events[0], "lines")
  assert.equal(sf.events[1], "load")
  assert.equal(sf.lastLoad?.length, 2)
  assert.equal(sf.lastLoad?.some((r) => r.avLineItemId == null), true)
  assert.equal(sf.lastLoad?.some((r) => r.avLineItemId === "bicau002pv4"), true)
  assert.equal(sf.logs[0]?.status, "loaded")
  assert.equal(summary.tests[0]?.tests.t1.ok, true)
  assert.equal(summary.tests[0]?.tests.t4.ok, true)
  assert.equal(summary.tests[0]?.tests.t5.ok, true)
  assert.equal(summary.t5Drift, 0)
  assert.deepEqual(box.moves, ["Processed"])
})

test("an unknown LOAD_MODE fails the file and loads nothing", async () => {
  const bytes = await xlsx([validRow()])
  const sf = snowflakeStub({ map: [{ ...CF_MAP, loadMode: "merge_into" }] })
  const box = mailbox([{ name: "cf.xlsx", bytes }])
  const summary = await runPartnerIngest({ mailbox: box, snowflake: sf })
  assert.equal(summary.failed, 1)
  assert.equal(summary.loaded, 0)
  assert.equal(sf.lastLoad, null)
  assert.equal(sf.logs[0]?.status, "parse_failed")
  assert.match(sf.logs[0]?.errorText ?? "", /unknown LOAD_MODE "merge_into"/)
  assert.deepEqual(box.moves, ["Failed"])
})

test("a source with no parser is treated as unrecognised", async () => {
  const bytes = await xlsx([validRow()])
  const sf = snowflakeStub({ map: [{ ...CF_MAP, sourceSlug: "broadsign" }] })
  const box = mailbox([{ name: "cf.xlsx", bytes }])
  const summary = await runPartnerIngest({ mailbox: box, snowflake: sf })
  assert.equal(summary.unrecognised, 1)
  assert.equal(summary.filesSeen, 0)
  assert.equal(sf.logs[0]?.status, "unrecognised")
  assert.equal(sf.logs[0]?.sourceSlug, "broadsign")
  assert.match(sf.logs[0]?.errorText ?? "", /no parser for source/)
  assert.deepEqual(box.moves, ["Unrecognised"])
})

test("the load mode from the map row reaches the writer", async () => {
  const bytes = await xlsx([validRow()])
  const sf = snowflakeStub({ map: [{ ...CF_MAP, loadMode: "day_replace" }] })
  const box = mailbox([{ name: "cf.xlsx", bytes }])
  await runPartnerIngest({ mailbox: box, snowflake: sf })
  assert.equal(sf.loadModes[0], "day_replace")
})

test("stale sources are reported against MAX_STALE_DAYS", async () => {
  const bytes = await xlsx([validRow()])
  const sf = snowflakeStub({
    map: [CF_MAP, { ...CF_MAP, sourceSlug: "vistar", sourceLabel: "Vistar", maxStaleDays: 2 }],
    maxReportDates: { "Channel Factory": "2026-09-13", Vistar: "2026-09-05" },
  })
  const box = mailbox([{ name: "cf.xlsx", bytes }])
  const summary = await runPartnerIngest({
    mailbox: box,
    snowflake: sf,
    today: "2026-09-15",
  })
  assert.deepEqual(summary.staleSources, [{ sourceSlug: "vistar", staleDays: 10 }])
})

test("staleness is empty when every source is inside its window", async () => {
  const bytes = await xlsx([validRow()])
  const sf = snowflakeStub({
    maxReportDates: { "Channel Factory": "2026-09-13" },
  })
  const box = mailbox([{ name: "cf.xlsx", bytes }])
  const summary = await runPartnerIngest({
    mailbox: box,
    snowflake: sf,
    today: "2026-09-15",
  })
  assert.deepEqual(summary.staleSources, [])
})

test("T5 failure writes raw lines and does not load daily", async () => {
  const bytes = await xlsx([
    validRow({ videoViews: 100, rateFull: 0.6 }),
  ])
  const sf = snowflakeStub()
  const box = mailbox([{ name: "cf.xlsx", bytes }])
  const summary = await runPartnerIngest({ mailbox: box, snowflake: sf })
  assert.equal(summary.failed, 1)
  assert.equal(sf.events[0], "lines")
  assert.equal(sf.lastLoad, null)
  assert.equal(sf.logs[0]?.status, "parse_failed")
  assert.match(sf.logs[0]?.errorText ?? "", /^T5:/)
  assert.equal(summary.t5Drift != null && summary.t5Drift > 0.02, true)
})
