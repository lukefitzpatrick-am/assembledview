import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import ExcelJS from "exceljs"

import { extractPlanCode } from "../extractPlanCode"
import {
  CHANNEL_FACTORY_EXPECTED_HEADER,
  parseChannelFactoryBuffer,
} from "../parsers/parseChannelFactory"
import { runPartnerFileParseTests } from "../parseTests"
import type { ChannelFactorySeedRow } from "../types"

const FIXTURE_XLSX = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "channel-factory-2026-09-14.xlsx"
)
const FIXTURE_SHA256 =
  "a54cae21f8383d01fbad2d3bb74bc232d0f2909c697d1471e1da226b91dbfe0c"

const PREAMBLE = [
  "Datorama",
  "Report 1248052",
  "Channel Factory daily delivery",
  "Generated 14 September 2026",
]

const HEADER_CELLS = CHANNEL_FACTORY_EXPECTED_HEADER.split("|")

async function workbookFromSeed(
  seed: ChannelFactorySeedRow[],
  opts?: { extraPreamble?: string[]; header?: string[]; totals?: boolean }
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet("Report")
  const preamble = opts?.extraPreamble ?? PREAMBLE
  for (const line of preamble) {
    ws.addRow([line])
  }
  ws.addRow(opts?.header ?? HEADER_CELLS)
  for (const row of seed) {
    ws.addRow([
      row.REPORT_DATE,
      row.PARTNER_ADVERTISER_ID,
      row.PARTNER_CAMPAIGN_NAME,
      row.PARTNER_LINE_ITEM_NAME,
      row.IMPRESSIONS,
      row.CLICKS,
      row.VIDEO_VIEWS,
      row.RATE_Q25,
      row.RATE_Q50,
      row.RATE_Q75,
      row.RATE_FULLY_PLAYED,
    ])
  }
  if (opts?.totals) {
    ws.addRow(["Total", "", "", "", 1, 0, 0, 0, 0, 0, 0])
  }
  const buf = await wb.xlsx.writeBuffer()
  return Buffer.from(buf)
}

function fixtureBuffer(): Buffer {
  return readFileSync(FIXTURE_XLSX)
}

test("14 Sep fixture is the real Datorama attachment", () => {
  const hash = createHash("sha256").update(fixtureBuffer()).digest("hex")
  assert.equal(hash, FIXTURE_SHA256)
})

test("14 Sep fixture parses byte-identical to the pre-dispatch parser", async () => {
  const parsed = await parseChannelFactoryBuffer(
    fixtureBuffer(),
    "channel-factory-2026-09-14.xlsx"
  )
  const json = JSON.stringify(parsed)
  assert.equal(json.length, 884_852)
  assert.equal(
    createHash("sha256").update(json).digest("hex"),
    "c26e9a5e94b47946d5634dfa1ad10d775eceb8b313274a42b8faeb1cf230fe77"
  )
})

test("14 Sep fixture: 1208 data rows, header on row 5, four preamble rows, no totals", async () => {
  const parsed = await parseChannelFactoryBuffer(
    fixtureBuffer(),
    "channel-factory-2026-09-14.xlsx"
  )
  assert.equal(parsed.headerRow, 5)
  assert.equal(parsed.preambleRowCount, 4)
  assert.equal(parsed.detectedHeader.split("|").length, 11)
  assert.equal(parsed.rows.length, 1208)
  assert.equal(parsed.rawLines.length, 4 + 1 + 1208)
  assert.equal(parsed.rawLines[4]?.rawLine.split("\t")[0], "Day")
})

test("14 Sep fixture: date span, codes, null codes, and metric totals", async () => {
  const parsed = await parseChannelFactoryBuffer(
    fixtureBuffer(),
    "channel-factory-2026-09-14.xlsx"
  )
  const dates = parsed.rows.map((r) => r.reportDate).sort()
  assert.equal(dates[0], "2026-01-12")
  assert.equal(dates[dates.length - 1], "2026-09-13")
  assert.equal(new Set(dates).size, 126)
  const codes = new Set(
    parsed.rows.map((r) => r.avLineItemId).filter((c): c is string => c != null)
  )
  assert.equal(codes.size, 9)
  assert.equal(parsed.rows.filter((r) => r.avLineItemId == null).length, 213)
  const sum = (fn: (r: (typeof parsed.rows)[number]) => number) =>
    parsed.rows.reduce((n, r) => n + fn(r), 0)
  assert.equal(sum((r) => r.impressions), 3_665_229)
  assert.equal(sum((r) => r.clicks), 1_148)
  assert.equal(sum((r) => r.videoViews), 1_371_798)
  assert.equal(sum((r) => r.completedViews), 2_961_000)
})

test("never drops an uncoded media buy", async () => {
  const buffer = await workbookFromSeed([
    {
      REPORT_DATE: "2026-09-13",
      PARTNER_ADVERTISER_ID: "1",
      PARTNER_CAMPAIGN_NAME: "Camp",
      PARTNER_LINE_ITEM_NAME: "CF12_AT1_P25-64 (Female List)",
      IMPRESSIONS: 10,
      CLICKS: 0,
      VIDEO_VIEWS: 4,
      RATE_Q25: 0.9,
      RATE_Q50: 0.8,
      RATE_Q75: 0.7,
      RATE_FULLY_PLAYED: 0.6,
    },
  ])
  const parsed = await parseChannelFactoryBuffer(buffer, "one.xlsx")
  assert.equal(parsed.rows.length, 1)
  assert.equal(parsed.rows[0]?.avLineItemId, null)
  assert.equal(parsed.rows[0]?.partnerLineItemName, "CF12_AT1_P25-64 (Female List)")
})

test("derives quartile views from rate × impressions, not video views", async () => {
  const buffer = await workbookFromSeed([
    {
      REPORT_DATE: "2026-09-13",
      PARTNER_ADVERTISER_ID: "1",
      PARTNER_CAMPAIGN_NAME: "Camp",
      PARTNER_LINE_ITEM_NAME: "CF12_AT1_P18-99_Birthday Hero_BICAU002PV4",
      IMPRESSIONS: 547,
      CLICKS: 1,
      VIDEO_VIEWS: 100,
      RATE_Q25: 0.9853747715,
      RATE_Q50: 0.8464351005,
      RATE_Q75: 0.7531992687,
      RATE_FULLY_PLAYED: 0.7239488117,
    },
  ])
  const parsed = await parseChannelFactoryBuffer(buffer, "one.xlsx")
  const row = parsed.rows[0]
  assert.equal(row?.avLineItemId, "bicau002pv4")
  assert.equal(row?.videoQ25, 539)
  assert.equal(row?.videoQ50, 463)
  assert.equal(row?.videoQ75, 412)
  assert.equal(row?.completedViews, 396)
})

test("locates the header by content when a preamble row is added", async () => {
  const buffer = await workbookFromSeed(
    [
      {
        REPORT_DATE: "2026-09-13",
        PARTNER_ADVERTISER_ID: "1",
        PARTNER_CAMPAIGN_NAME: "Camp",
        PARTNER_LINE_ITEM_NAME: "x",
        IMPRESSIONS: 10,
        CLICKS: 0,
        VIDEO_VIEWS: 4,
        RATE_Q25: 0.9,
        RATE_Q50: 0.8,
        RATE_Q75: 0.7,
        RATE_FULLY_PLAYED: 0.5,
      },
      {
        REPORT_DATE: "2026-09-12",
        PARTNER_ADVERTISER_ID: "1",
        PARTNER_CAMPAIGN_NAME: "Camp",
        PARTNER_LINE_ITEM_NAME: "y",
        IMPRESSIONS: 10,
        CLICKS: 0,
        VIDEO_VIEWS: 4,
        RATE_Q25: 0.9,
        RATE_Q50: 0.8,
        RATE_Q75: 0.7,
        RATE_FULLY_PLAYED: 0.5,
      },
    ],
    {
      extraPreamble: [...PREAMBLE, "extra line must not shift parse"],
    }
  )
  const parsed = await parseChannelFactoryBuffer(buffer, "shifted.xlsx")
  assert.equal(parsed.headerRow, 6)
  assert.equal(parsed.rows.length, 2)
})

test("drops a totals row whose first cell starts with total", async () => {
  const buffer = await workbookFromSeed(
    [
      {
        REPORT_DATE: "2026-09-13",
        PARTNER_ADVERTISER_ID: "1",
        PARTNER_CAMPAIGN_NAME: "Camp",
        PARTNER_LINE_ITEM_NAME: "CF12_AT1_P18-99_Birthday Hero_BICAU002PV4",
        IMPRESSIONS: 10,
        CLICKS: 1,
        VIDEO_VIEWS: 4,
        RATE_Q25: 0.9,
        RATE_Q50: 0.8,
        RATE_Q75: 0.7,
        RATE_FULLY_PLAYED: 0.5,
      },
    ],
    { totals: true }
  )
  const parsed = await parseChannelFactoryBuffer(buffer, "totals.xlsx")
  assert.equal(parsed.rows.length, 1)
})

test("T1 fails when the detected header drifts from EXPECTED_HEADER", async () => {
  const buffer = await workbookFromSeed(
    [
      {
        REPORT_DATE: "2026-09-13",
        PARTNER_ADVERTISER_ID: "1",
        PARTNER_CAMPAIGN_NAME: "Camp",
        PARTNER_LINE_ITEM_NAME: "x",
        IMPRESSIONS: 10,
        CLICKS: 0,
        VIDEO_VIEWS: 4,
        RATE_Q25: 0.9,
        RATE_Q50: 0.8,
        RATE_Q75: 0.7,
        RATE_FULLY_PLAYED: 0.5,
      },
    ],
    {
      header: [
        "Day",
        "Campaign Advertiser ID",
        "Campaign Name",
        "Media Buy Name",
        "Impressions",
        "Clicks",
        "Video Views",
        "Video Completions 75% Rate",
        "Video Completions 50% Rate",
        "Video Completions 25% Rate",
        "Video Fully Played Rate",
      ],
    }
  )
  const parsed = await parseChannelFactoryBuffer(buffer, "drift.xlsx")
  const tests = runPartnerFileParseTests(parsed, CHANNEL_FACTORY_EXPECTED_HEADER)
  assert.equal(tests.t1.ok, false)
  assert.equal(tests.failed, true)
})

test("T4 fails when quartile rates are not monotonically decreasing", async () => {
  const buffer = await workbookFromSeed([
    {
      REPORT_DATE: "2026-09-13",
      PARTNER_ADVERTISER_ID: "1",
      PARTNER_CAMPAIGN_NAME: "Camp",
      PARTNER_LINE_ITEM_NAME: "x",
      IMPRESSIONS: 10,
      CLICKS: 0,
      VIDEO_VIEWS: 4,
      RATE_Q25: 0.5,
      RATE_Q50: 0.8,
      RATE_Q75: 0.7,
      RATE_FULLY_PLAYED: 0.4,
    },
  ])
  const parsed = await parseChannelFactoryBuffer(buffer, "rates.xlsx")
  const tests = runPartnerFileParseTests(parsed, CHANNEL_FACTORY_EXPECTED_HEADER)
  assert.equal(tests.t4.ok, false)
  assert.equal(tests.failed, true)
})

test("T5 on the 14 Sep file scopes VIDEO_VIEWS > 0 and gates at 0.00094", async () => {
  const parsed = await parseChannelFactoryBuffer(
    fixtureBuffer(),
    "channel-factory-2026-09-14.xlsx"
  )
  const tests = runPartnerFileParseTests(parsed, CHANNEL_FACTORY_EXPECTED_HEADER)
  assert.equal(tests.t1.ok, true)
  assert.equal(tests.t4.ok, true)
  assert.equal(tests.t5.ok, true)
  assert.equal(tests.failed, false)
  assert.equal(Number((tests.t5.value ?? NaN).toFixed(5)), 0.00094)
  assert.match(tests.t5.detail, /video_views=1371798/)
  assert.match(tests.t5.detail, /scoped_rows=1095/)
  assert.match(tests.t5.detail, /excluded_zero_view=113/)
})

test("T5 excludes VIDEO_VIEWS = 0 rows instead of failing them", async () => {
  const buffer = await workbookFromSeed([
    {
      REPORT_DATE: "2026-09-13",
      PARTNER_ADVERTISER_ID: "1",
      PARTNER_CAMPAIGN_NAME: "OP069175_<Q2 2026>",
      PARTNER_LINE_ITEM_NAME: "@YT Bumpers",
      IMPRESSIONS: 1000,
      CLICKS: 0,
      VIDEO_VIEWS: 0,
      RATE_Q25: 1,
      RATE_Q50: 1,
      RATE_Q75: 1,
      RATE_FULLY_PLAYED: 1,
    },
    {
      REPORT_DATE: "2026-09-13",
      PARTNER_ADVERTISER_ID: "1",
      PARTNER_CAMPAIGN_NAME: "Camp",
      PARTNER_LINE_ITEM_NAME: "x",
      IMPRESSIONS: 1000,
      CLICKS: 0,
      VIDEO_VIEWS: 800,
      RATE_Q25: 0.9,
      RATE_Q50: 0.85,
      RATE_Q75: 0.82,
      RATE_FULLY_PLAYED: 0.8,
    },
  ])
  const parsed = await parseChannelFactoryBuffer(buffer, "t5-zero.xlsx")
  const tests = runPartnerFileParseTests(parsed, CHANNEL_FACTORY_EXPECTED_HEADER)
  assert.equal(tests.t4.ok, true)
  assert.equal(tests.t5.ok, true)
  assert.equal(tests.failed, false)
  assert.match(tests.t5.detail, /excluded_zero_view=1/)
})

test("T5 fails the load gate when scoped drift exceeds 2%", async () => {
  const buffer = await workbookFromSeed([
    {
      REPORT_DATE: "2026-09-13",
      PARTNER_ADVERTISER_ID: "1",
      PARTNER_CAMPAIGN_NAME: "Camp",
      PARTNER_LINE_ITEM_NAME: "x",
      IMPRESSIONS: 1000,
      CLICKS: 0,
      VIDEO_VIEWS: 100,
      RATE_Q25: 0.9,
      RATE_Q50: 0.8,
      RATE_Q75: 0.7,
      RATE_FULLY_PLAYED: 0.6,
    },
  ])
  const parsed = await parseChannelFactoryBuffer(buffer, "t5-fail.xlsx")
  const tests = runPartnerFileParseTests(parsed, CHANNEL_FACTORY_EXPECTED_HEADER)
  assert.equal(tests.t4.ok, true)
  assert.equal(tests.t5.ok, false)
  assert.equal(tests.failed, true)
})

test("report date accepts Date, Excel serial and YYYY-MM-DD", async () => {
  const buffer = await workbookFromSeed([
    {
      REPORT_DATE: "2026-09-13",
      PARTNER_ADVERTISER_ID: "1",
      PARTNER_CAMPAIGN_NAME: "Camp",
      PARTNER_LINE_ITEM_NAME: "iso",
      IMPRESSIONS: 10,
      CLICKS: 0,
      VIDEO_VIEWS: 4,
      RATE_Q25: 0.9,
      RATE_Q50: 0.8,
      RATE_Q75: 0.7,
      RATE_FULLY_PLAYED: 0.5,
    },
  ])
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer)
  const ws = wb.worksheets[0]!
  ws.addRow([
    new Date(Date.UTC(2026, 8, 12)),
    "1",
    "Camp",
    "date-obj",
    10,
    0,
    4,
    0.9,
    0.8,
    0.7,
    0.5,
  ])
  ws.addRow([
    46278,
    "1",
    "Camp",
    "serial",
    10,
    0,
    4,
    0.9,
    0.8,
    0.7,
    0.5,
  ])
  const mixed = Buffer.from(await wb.xlsx.writeBuffer())
  const parsed = await parseChannelFactoryBuffer(mixed, "dates.xlsx")
  const dates = parsed.rows.map((r) => r.reportDate).sort()
  assert.deepEqual(dates, ["2026-09-12", "2026-09-13", "2026-09-13"])
})

test("T5 passes when completed views sit within 2% of video views", async () => {
  const buffer = await workbookFromSeed([
    {
      REPORT_DATE: "2026-09-13",
      PARTNER_ADVERTISER_ID: "1",
      PARTNER_CAMPAIGN_NAME: "Camp",
      PARTNER_LINE_ITEM_NAME: "x",
      IMPRESSIONS: 1000,
      CLICKS: 0,
      VIDEO_VIEWS: 800,
      RATE_Q25: 0.9,
      RATE_Q50: 0.85,
      RATE_Q75: 0.82,
      RATE_FULLY_PLAYED: 0.8,
    },
  ])
  const parsed = await parseChannelFactoryBuffer(buffer, "t5.xlsx")
  const tests = runPartnerFileParseTests(parsed, CHANNEL_FACTORY_EXPECTED_HEADER)
  assert.equal(tests.t5.ok, true)
  assert.equal(extractPlanCode(parsed.rows[0]?.partnerLineItemName ?? ""), null)
})
