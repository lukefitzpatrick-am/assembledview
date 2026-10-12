import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import {
  formatDeckCount,
  formatDeckMoney,
  formatDeckPacePercent,
  formatDeckPercent,
  formatFrequencyTarget,
  slimDeckPayload,
} from "./slim-deck-payload"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")

function fixture(mba: string): Record<string, unknown> {
  const file = path.join(
    repoRoot,
    "docs/superpowers/overnight-av-fixes/discovery",
    `AV-TP10-${mba}-2026-09.json`,
  )
  return JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>
}

test("hema007 and curatif004 slim payloads stay under 25 KB and keep the deck figures", () => {
  for (const mba of ["hema007", "curatif004"]) {
    const source = fixture(mba)
    const slim = slimDeckPayload(source)
    const bytes = Buffer.byteLength(JSON.stringify(slim))
    assert.ok(bytes < 25_000, `${mba} slim payload is ${bytes} bytes`)
    assert.equal(slim.mbaNumber, mba)
    assert.ok(slim.summary && typeof slim.summary === "object")
    assert.ok(Array.isArray(slim.channels) && slim.channels.length > 0)
    assert.ok(Array.isArray(slim.kpis) && slim.kpis.length > 0)
    assert.ok(Array.isArray(slim.notLive))
    assert.equal("weekly" in slim, false)
    assert.equal(JSON.stringify(slim).includes('"daily"'), false)
    const live = (slim.channels as { notLive?: boolean }[]).filter((channel) => channel.notLive === true)
    assert.equal((slim.notLive as unknown[]).length, live.length)
  }
  const hema = slimDeckPayload(fixture("hema007"))
  const summary = hema.summary as { spend: string; impressions: string }
  assert.equal(summary.spend, "$3,484.79")
  assert.equal(summary.impressions, "394,863")
  const summaryRecord = hema.summary as {
    timeElapsedPct: string
    metrics: { spendPacePct: string; ctr: string }
  }
  assert.equal(summaryRecord.timeElapsedPct, "74.80%")
  assert.equal(summaryRecord.metrics.ctr, "2.31%")
  assert.equal(summaryRecord.metrics.spendPacePct, "35%")
  const social = (hema.channels as { metrics: { spendPacePct: string; ctr: string } }[])[0]
  assert.equal(social.metrics.spendPacePct, "116%")
  assert.equal(social.metrics.ctr, "2.31%")
  const encoded = JSON.stringify(hema)
  assert.equal(encoded.includes("3484.7899999999995"), false)
  assert.equal(encoded.includes("394863"), false)
  const kpis = hema.kpis as { metric: string; targetDisplay: string; actualDisplay: string }[]
  const frequency = kpis.find((kpi) => kpi.metric === "frequency")
  assert.equal(frequency?.targetDisplay, "1.0 frequency")
  assert.equal(frequency?.actualDisplay, "Not yet reported")
})

test("deck figures format money, counts, percents and frequency targets", () => {
  assert.equal(formatDeckMoney(3484.7899999999995), "$3,484.79")
  assert.equal(formatDeckCount(394863), "394,863")
  assert.equal(formatDeckPercent(0.02305103288988839), "2.31%")
  assert.equal(formatDeckPacePercent(0.3484789999999999), "35%")
  assert.equal(formatDeckPacePercent(1.1615966666666666), "116%")
  assert.equal(formatFrequencyTarget("1"), "1.0 frequency")
  assert.equal(formatFrequencyTarget("1.0 frequency"), "1.0 frequency")
})

test("daily rows become one weekly point per week and channel", () => {
  const source = fixture("hema007")
  const channels = source.channels as Record<string, unknown>[]
  channels[0] = {
    ...channels[0],
    daily: [
      { date: "2026-09-01", spend: 10, impressions: 100 },
      { date: "2026-09-02", spend: 5, impressions: 50 },
      { date: "2026-09-08", spend: 7, impressions: 70 },
    ],
  }
  const slim = slimDeckPayload(source)
  const encoded = JSON.stringify(slim)
  assert.equal(encoded.includes('"daily"'), false)
  assert.deepEqual(slim.weekly, [
    { weekStart: "2026-08-31", channel: "Social (Meta)", spend: "$15.00", impressions: "150" },
    { weekStart: "2026-09-07", channel: "Social (Meta)", spend: "$7.00", impressions: "70" },
  ])
})
