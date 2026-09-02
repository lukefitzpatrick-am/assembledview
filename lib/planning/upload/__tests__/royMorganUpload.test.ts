import assert from "node:assert/strict"
import test from "node:test"
import { adaptAudienceToEngine } from "../../adapter.js"
import { buildUploadedAudienceResponse } from "../buildUploadedAudienceResponse.js"
import { extractRmDefinition } from "../extractRmDefinition.js"
import { mapRoyMorganToChannels } from "../mapRoyMorganToChannels.js"
import { parseRoyMorganWorkbook } from "../parseRoyMorganWorkbook.js"
import { ENGINE_LEAF_IDS, STUB_PLANNING_CHANNELS, STUB_PLANNING_META } from "./planningDimStub.js"
import {
  THREE_MEDIA,
  workbookBuffer,
  writeBlock,
  writePreamble,
  type FixtureDataRow,
} from "./rmWorkbookFixtures.js"
import type { RmBlock } from "../royMorganTypes.js"

function allBlocks(parse: Awaited<ReturnType<typeof parseRoyMorganWorkbook>>): RmBlock[] {
  return parse.sheets.flatMap((s) => s.blocks)
}

function audienceRows(extra: FixtureDataRow[] = []): FixtureDataRow[] {
  return [...THREE_MEDIA, ...extra]
}

test("1. single column + preamble, no TOTAL → 1 block, universe_wc 0, unweighted_n parsed, pct null", async () => {
  const buf = await workbookBuffer((wb) => {
    const ws = wb.addWorksheet("Run")
    writePreamble(ws)
    writeBlock(ws, {
      labelCol: 1,
      firstMetricCol: 2,
      metricRow: 9,
      name: "Qatar Airways_Families",
      unweighted: 412,
      popn: 500,
      metrics: ["wc"],
      rows: [
        { label: "MEDIA", metricsEmpty: true },
        { label: "FTA TV", wc: 120 },
        { label: "Radio", wc: 80 },
        { label: "Cinema", wc: 15 },
      ],
    })
  })
  const parsed = await parseRoyMorganWorkbook(buf, "single.xlsx")
  const blocks = allBlocks(parsed)
  assert.equal(blocks.length, 1)
  const block = blocks[0]!
  assert.equal(block.isBase, false)
  assert.equal(block.unweightedN, 412)
  assert.equal(block.popn000, 500)
  assert.ok(block.rows.every((r) => r.reachPct == null))
  assert.equal(parsed.sheets[0]?.waveCode, "MAR26E1_ASM")
  assert.equal(parsed.sheets[0]?.filter, "All cases")
  assert.equal(block.filter, "All cases")

  const mapping = mapRoyMorganToChannels({ block, channels: STUB_PLANNING_CHANNELS })
  const audience = buildUploadedAudienceResponse({
    mapping,
    block,
    baseBlock: null,
    channels: STUB_PLANNING_CHANNELS,
    segmentKey: "seg_upload",
    waveCode: parsed.sheets[0]?.waveCode ?? null,
    reachBasis: "total",
  })
  assert.equal(audience.universe_wc, 0)
  assert.equal(audience.unweighted_n, 412)
  assert.equal(audience.audience_wc, 500)
})

test("2. TOTAL + 1 audience + junk columns to the right → 2 blocks kept, junk skipped", async () => {
  const buf = await workbookBuffer((wb) => {
    const ws = wb.addWorksheet("Run")
    writePreamble(ws)
    writeBlock(ws, {
      labelCol: 1,
      firstMetricCol: 2,
      metricRow: 9,
      name: "TOTAL",
      unweighted: 2000,
      popn: 18000,
      metrics: ["wc", "v%", "ix"],
      mergeNameAcross: 3,
      rows: audienceRows(),
    })
    writeBlock(ws, {
      labelCol: 1,
      firstMetricCol: 5,
      metricRow: 9,
      name: "Qatar Airways_Families",
      unweighted: 412,
      popn: 500,
      metrics: ["wc", "v%", "ix"],
      mergeNameAcross: 3,
      rows: audienceRows(),
    })
    writeBlock(ws, {
      labelCol: 14,
      firstMetricCol: 15,
      metricRow: 9,
      name: "Planning leftover",
      unweighted: null,
      popn: null,
      metrics: ["wc", "v%", "ix"],
      rows: [{ label: "Budget", wc: 1, reachPct: 0.1, index: 100 }],
    })
  })
  const parsed = await parseRoyMorganWorkbook(buf, "junk.xlsx")
  const sheet = parsed.sheets[0]!
  assert.equal(sheet.blocks.length, 2)
  assert.ok(sheet.blocks.some((b) => b.isBase))
  assert.ok(sheet.skipped.some((s) => s.atCol === 15))
})

test("3. TOTAL + 4 audiences, wc/v%/ix → 5 blocks, names from merged header", async () => {
  const names = [
    "TOTAL",
    "Qatar Airways_Families",
    "Audience Two",
    "Audience Three",
    "Audience Four",
  ]
  const buf = await workbookBuffer((wb) => {
    const ws = wb.addWorksheet("Crosstab")
    writePreamble(ws)
    names.forEach((name, i) => {
      writeBlock(ws, {
        labelCol: 1,
        firstMetricCol: 2 + i * 3,
        metricRow: 9,
        name,
        unweighted: name === "TOTAL" ? 2000 : 400 + i,
        popn: name === "TOTAL" ? 18000 : 500 + i,
        metrics: ["wc", "v%", "ix"],
        mergeNameAcross: 3,
        rows: audienceRows(),
      })
    })
  })
  const parsed = await parseRoyMorganWorkbook(buf, "five.xlsx")
  const blocks = allBlocks(parsed)
  assert.equal(blocks.length, 5)
  assert.deepEqual(
    blocks.map((b) => b.columnName),
    names
  )
  assert.equal(blocks.filter((b) => b.isBase).length, 1)
})

test("4. TOTAL + 4 audiences, wc/v% only → metrics [wc, v%], every index null", async () => {
  const names = ["TOTAL", "A1", "A2", "A3", "A4"]
  const buf = await workbookBuffer((wb) => {
    const ws = wb.addWorksheet("NoIx")
    writePreamble(ws)
    names.forEach((name, i) => {
      writeBlock(ws, {
        labelCol: 1,
        firstMetricCol: 2 + i * 2,
        metricRow: 9,
        name,
        unweighted: 400,
        popn: 800,
        metrics: ["wc", "v%"],
        rows: audienceRows(),
      })
    })
  })
  const parsed = await parseRoyMorganWorkbook(buf, "no-ix.xlsx")
  const blocks = allBlocks(parsed)
  assert.equal(blocks.length, 5)
  for (const b of blocks) {
    assert.deepEqual(b.metrics, ["wc", "v%"])
    assert.ok(b.rows.every((r) => r.index == null))
    assert.ok(!b.rows.some((r) => r.index === 100))
  }
})

test("5. two side-by-side blocks, different labelCol, filter captured", async () => {
  const buf = await workbookBuffer((wb) => {
    const ws = wb.addWorksheet("HML")
    writePreamble(ws, { filter: "Country Areas" })
    ws.getCell(3, 8).value = "Filter: All cases"
    writeBlock(ws, {
      labelCol: 1,
      firstMetricCol: 2,
      metricRow: 9,
      name: "TOTAL",
      unweighted: 900,
      popn: 4000,
      metrics: ["wc", "v%", "ix"],
      rows: audienceRows(),
    })
    writeBlock(ws, {
      labelCol: 8,
      firstMetricCol: 9,
      metricRow: 9,
      name: "HML",
      unweighted: 220,
      popn: 800,
      metrics: ["wc", "v%", "ix"],
      rows: audienceRows(),
    })
  })
  const parsed = await parseRoyMorganWorkbook(buf, "hml.xlsx")
  const sheet = parsed.sheets[0]!
  assert.equal(sheet.blocks.length, 2)
  assert.equal(sheet.filter, "Country Areas")
  const byName = Object.fromEntries(sheet.blocks.map((b) => [b.columnName, b]))
  assert.equal(byName.TOTAL?.labelCol, 1)
  assert.equal(byName.HML?.labelCol, 8)
  assert.equal(byName.TOTAL?.filter, "Country Areas")
  assert.equal(byName.HML?.filter, "All cases")
})

test("5b. Filter outside the block column window falls back to sheet.filter", async () => {
  const buf = await workbookBuffer((wb) => {
    const ws = wb.addWorksheet("Run")
    ws.getCell(1, 1).value = "MAR26E1_ASM"
    ws.getCell(2, 1).value = "Survey Period: Jan - Dec 2025"
    ws.getCell(3, 20).value = "Filter: Grocery buyers"
    ws.getCell(4, 1).value = "Weights: weighted"
    writeBlock(ws, {
      labelCol: 1,
      firstMetricCol: 2,
      metricRow: 9,
      name: "Audience",
      unweighted: 412,
      popn: 500,
      metrics: ["wc", "v%", "ix"],
      rows: audienceRows(),
    })
  })
  const parsed = await parseRoyMorganWorkbook(buf, "fallback.xlsx")
  const sheet = parsed.sheets[0]!
  assert.equal(sheet.filter, "Grocery buyers")
  assert.equal(sheet.blocks[0]?.filter, "Grocery buyers")
})

test("6. v%/ix only (no wc) → reach_wc derived from reachPct × audience_wc", async () => {
  const buf = await workbookBuffer((wb) => {
    const ws = wb.addWorksheet("NoWc")
    writePreamble(ws)
    writeBlock(ws, {
      labelCol: 1,
      firstMetricCol: 2,
      metricRow: 9,
      name: "Audience",
      unweighted: 300,
      popn: 1000,
      metrics: ["v%", "ix"],
      rows: [
        { label: "MEDIA", metricsEmpty: true },
        { label: "FTA TV", reachPct: 0.24, index: 110 },
        { label: "Radio", reachPct: 0.16, index: 95 },
        { label: "Cinema", reachPct: 0.03, index: 80 },
      ],
    })
  })
  const parsed = await parseRoyMorganWorkbook(buf, "no-wc.xlsx")
  const block = allBlocks(parsed)[0]!
  const mapping = mapRoyMorganToChannels({ block, channels: STUB_PLANNING_CHANNELS })
  const audience = buildUploadedAudienceResponse({
    mapping,
    block,
    baseBlock: null,
    channels: STUB_PLANNING_CHANNELS,
    segmentKey: "seg_upload",
    waveCode: null,
    reachBasis: "total",
  })
  const fta = audience.channels.find((c) => c.channel_id === "tv_fta")
  assert.ok(fta)
  assert.equal(fta.reach_wc, Math.round(0.24 * 1000))
  assert.equal(fta.reach_pct, 0.24)
})

test("7. non-Roy-Morgan sheet (budget grid) → 0 blocks, a skipped entry, no throw", async () => {
  const buf = await workbookBuffer((wb) => {
    const ws = wb.addWorksheet("Planning")
    ws.getCell(1, 1).value = "Channel"
    ws.getCell(1, 2).value = "Budget"
    ws.getCell(2, 1).value = "TV"
    ws.getCell(2, 2).value = 250000
    ws.getCell(3, 1).value = "Radio"
    ws.getCell(3, 2).value = 80000
  })
  const parsed = await parseRoyMorganWorkbook(buf, "budget.xlsx")
  assert.equal(allBlocks(parsed).length, 0)
  assert.ok((parsed.sheets[0]?.skipped.length ?? 0) >= 1)
})

test("8. v% expressed as 25.3 instead of 0.253 → whole column divided by 100", async () => {
  const buf = await workbookBuffer((wb) => {
    const ws = wb.addWorksheet("Pct")
    writePreamble(ws)
    writeBlock(ws, {
      labelCol: 1,
      firstMetricCol: 2,
      metricRow: 9,
      name: "Audience",
      unweighted: 300,
      popn: 1000,
      metrics: ["wc", "v%", "ix"],
      rows: [
        { label: "MEDIA", metricsEmpty: true },
        { label: "FTA TV", wc: 253, reachPct: 25.3, index: 110 },
        { label: "Radio", wc: 160, reachPct: 16, index: 95 },
        { label: "Cinema", wc: 30, reachPct: 3, index: 80 },
      ],
    })
  })
  const parsed = await parseRoyMorganWorkbook(buf, "pct.xlsx")
  const block = allBlocks(parsed)[0]!
  const fta = block.rows.find((r) => r.label === "FTA TV")
  const radio = block.rows.find((r) => r.label === "Radio")
  assert.ok(fta && radio)
  assert.ok(Math.abs((fta.reachPct ?? 0) - 0.253) < 1e-9)
  assert.ok(Math.abs((radio.reachPct ?? 0) - 0.16) < 1e-9)
})

test("9. '-' cells → suppressed true, suppressed_cells counted", async () => {
  const buf = await workbookBuffer((wb) => {
    const ws = wb.addWorksheet("Supp")
    writePreamble(ws)
    writeBlock(ws, {
      labelCol: 1,
      firstMetricCol: 2,
      metricRow: 9,
      name: "Audience",
      unweighted: 80,
      popn: 400,
      metrics: ["wc", "v%", "ix"],
      rows: [
        { label: "MEDIA", metricsEmpty: true },
        { label: "FTA TV", wc: 120, reachPct: 0.3, index: 110 },
        { label: "Radio", wc: 80, reachPct: 0.2, index: 95 },
        { label: "Cinema", wc: 15, reachPct: 0.04, index: 80 },
        { label: "Pay TV", wc: "-", reachPct: "-", index: "-" },
      ],
    })
  })
  const parsed = await parseRoyMorganWorkbook(buf, "dash.xlsx")
  const block = allBlocks(parsed)[0]!
  const pay = block.rows.find((r) => r.label === "Pay TV")
  assert.equal(pay?.suppressed, true)
  assert.equal(pay?.wc, null)
  assert.equal(pay?.reachPct, null)
  const mapping = mapRoyMorganToChannels({ block, channels: STUB_PLANNING_CHANNELS })
  const audience = buildUploadedAudienceResponse({
    mapping,
    block,
    baseBlock: null,
    channels: STUB_PLANNING_CHANNELS,
    segmentKey: "seg_upload",
    waveCode: null,
    reachBasis: "total",
  })
  assert.ok(audience.suppressed_cells >= 1)
})

const TYPOLOGY: FixtureDataRow[] = [
  { label: "MEDIA", metricsEmpty: true },
  { label: "FTA TV", wc: 100, reachPct: 0.2, index: 110 },
  { label: "BVOD", wc: 50, reachPct: 0.1, index: 120 },
  { label: "YouTube (People 18+)", wc: 80, reachPct: 0.16, index: 105 },
  { label: "Radio", wc: 70, reachPct: 0.14, index: 90 },
  { label: "Newspaper", wc: 40, reachPct: 0.08, index: 80 },
  { label: "Newspapers", wc: 55, reachPct: 0.11, index: 85 },
  { label: "Facebook", wc: 90, reachPct: 0.18, index: 95 },
  { label: "Instagram", wc: 60, reachPct: 0.12, index: 100 },
  { label: "Cinema", wc: 10, reachPct: 0.02, index: 70 },
  { label: "Internet", wc: 200, reachPct: 0.4, index: 130 },
  { label: "STATES", metricsEmpty: true },
  { label: "Victoria", wc: 500, reachPct: 1, index: 100 },
]

test("10. mapper aliases, unmatched Internet, typology-only 8/21 coverage", async () => {
  const buf = await workbookBuffer((wb) => {
    const ws = wb.addWorksheet("Typology")
    writePreamble(ws)
    writeBlock(ws, {
      labelCol: 1,
      firstMetricCol: 2,
      metricRow: 9,
      name: "Audience",
      unweighted: 500,
      popn: 900,
      metrics: ["wc", "v%", "ix"],
      rows: TYPOLOGY,
    })
  })
  const parsed = await parseRoyMorganWorkbook(buf, "typology.xlsx")
  const block = allBlocks(parsed)[0]!
  const mapping = mapRoyMorganToChannels({ block, channels: STUB_PLANNING_CHANNELS })

  assert.equal(
    mapping.mapped.find((m) => m.sourceLabel === "Newspapers")?.channelId,
    "news_total"
  )
  assert.equal(
    mapping.mapped.find((m) => m.sourceLabel === "Newspaper")?.channelId,
    "news_print"
  )
  assert.equal(
    mapping.mapped.find((m) => m.sourceLabel === "YouTube (People 18+)")?.channelId,
    "youtube"
  )
  assert.ok(mapping.unmatchedRows.some((u) => u.label === "Internet"))
  assert.equal(
    mapping.unmatchedRows.some((u) => u.label === "Victoria"),
    false
  )
  assert.equal(mapping.scoreableCount, 8)
  assert.equal(mapping.uncoveredLeafIds.length, 13)
  assert.equal(ENGINE_LEAF_IDS.length, 21)
  assert.equal(mapping.scoreableCount + mapping.uncoveredLeafIds.length, 21)
})

test("11. inheritRollupIds ooh_total → four OOH leaves inherited", async () => {
  const buf = await workbookBuffer((wb) => {
    const ws = wb.addWorksheet("OOH")
    writePreamble(ws)
    writeBlock(ws, {
      labelCol: 1,
      firstMetricCol: 2,
      metricRow: 9,
      name: "Audience",
      unweighted: 400,
      popn: 800,
      metrics: ["wc", "v%", "ix"],
      rows: [
        { label: "MEDIA", metricsEmpty: true },
        { label: "Outdoor", wc: 200, reachPct: 0.4, index: 115 },
        { label: "FTA TV", wc: 100, reachPct: 0.2, index: 90 },
        { label: "Radio", wc: 80, reachPct: 0.16, index: 95 },
      ],
    })
  })
  const parsed = await parseRoyMorganWorkbook(buf, "ooh.xlsx")
  const block = allBlocks(parsed)[0]!
  const mapping = mapRoyMorganToChannels({
    block,
    channels: STUB_PLANNING_CHANNELS,
    options: { inheritRollupIds: ["ooh_total"], benchmarkOnlyIds: [] },
  })
  const inherited = mapping.mapped.filter((m) => m.provenance === "inherited")
  assert.equal(inherited.length, 4)
  for (const id of ["ooh_street", "ooh_billboard", "ooh_shopping", "ooh_transit"]) {
    const row = inherited.find((m) => m.channelId === id)
    assert.ok(row, id)
    assert.equal(row.inheritedFrom, "ooh_total")
    assert.equal(row.sourceRowIndex, null)
    assert.equal(row.reachPct, 0.4)
  }
})

test("12. buildUploadedAudienceResponse passes adaptAudienceToEngine with non-empty channels", async () => {
  const buf = await workbookBuffer((wb) => {
    const ws = wb.addWorksheet("Contract")
    writePreamble(ws)
    writeBlock(ws, {
      labelCol: 1,
      firstMetricCol: 2,
      metricRow: 9,
      name: "TOTAL",
      unweighted: 2000,
      popn: 18000,
      metrics: ["wc", "v%", "ix"],
      mergeNameAcross: 3,
      rows: audienceRows(),
    })
    writeBlock(ws, {
      labelCol: 1,
      firstMetricCol: 5,
      metricRow: 9,
      name: "Families",
      unweighted: 412,
      popn: 500,
      metrics: ["wc", "v%", "ix"],
      mergeNameAcross: 3,
      rows: audienceRows(),
    })
  })
  const parsed = await parseRoyMorganWorkbook(buf, "contract.xlsx")
  const sheet = parsed.sheets[0]!
  const baseBlock = sheet.blocks.find((b) => b.isBase) ?? null
  const block = sheet.blocks.find((b) => !b.isBase)!
  const mapping = mapRoyMorganToChannels({ block, channels: STUB_PLANNING_CHANNELS })
  const audience = buildUploadedAudienceResponse({
    mapping,
    block,
    baseBlock,
    channels: STUB_PLANNING_CHANNELS,
    segmentKey: "seg_upload",
    waveCode: sheet.waveCode,
    reachBasis: "total",
  })
  assert.equal(audience.wave_id, "MAR26E1_ASM")
  assert.equal(audience.universe_wc, 18000)
  assert.equal(audience.unweighted_n, 412)
  const fta = audience.channels.find((c) => c.channel_id === "tv_fta")
  assert.equal(fta?.affinity_by_segment.seg_upload, 110)
  const adapted = adaptAudienceToEngine({
    audience,
    meta: STUB_PLANNING_META,
    segmentId: "seg_upload",
  })
  assert.ok(adapted.channels.length > 0)
  assert.equal(adapted.universeWc, 18000)
  assert.equal(adapted.unweightedN, 412)
})

test("extractRmDefinition: single-state Victoria + Men + age sub-bands", () => {
  const block: RmBlock = {
    blockId: "t:2",
    columnName: "Vic",
    isBase: false,
    labelCol: 1,
    metrics: ["wc", "v%", "ix"],
    unweightedN: 200,
    popn000: 400,
    filter: null,
    rows: [
      {
        section: "STATES",
        label: "N.S.W. incl. ACT",
        rowIndex: 20,
        wc: 0,
        reachPct: 0,
        index: 0,
        suppressed: false,
      },
      {
        section: "STATES",
        label: "Victoria",
        rowIndex: 21,
        wc: 400,
        reachPct: 1,
        index: 100,
        suppressed: false,
      },
      {
        section: "SEX",
        label: "Men",
        rowIndex: 30,
        wc: 400,
        reachPct: 0.99,
        index: 100,
        suppressed: false,
      },
      {
        section: "SEX",
        label: "Women",
        rowIndex: 31,
        wc: 4,
        reachPct: 0.01,
        index: 10,
        suppressed: false,
      },
      {
        section: "AGE - detailed",
        label: "25-34",
        rowIndex: 40,
        wc: 100,
        reachPct: 0.25,
        index: 90,
        suppressed: false,
      },
      {
        section: "AGE - detailed",
        label: "35-44",
        rowIndex: 41,
        wc: 80,
        reachPct: 0.2,
        index: 95,
        suppressed: false,
      },
    ],
  }
  const def = extractRmDefinition(block)
  assert.deepEqual(def.states, ["VIC"])
  assert.equal(def.gender, "male")
  assert.deepEqual(def.ageBands, ["25-34", "35-49"])
  assert.equal(def.confident, true)
})
