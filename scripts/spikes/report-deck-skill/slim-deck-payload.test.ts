import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import { slimDeckPayload } from "./slim-deck-payload"

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
  const summary = hema.summary as { spend: number }
  assert.equal(summary.spend, 3484.7899999999995)
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
    { weekStart: "2026-08-31", channel: "Social (Meta)", spend: 15, impressions: 150 },
    { weekStart: "2026-09-07", channel: "Social (Meta)", spend: 7, impressions: 70 },
  ])
})
