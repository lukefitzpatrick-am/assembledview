/**
 * ingest_eval_runs overlay: cron write + latest-per-publisher read.
 */
import assert from "node:assert/strict"
import test from "node:test"
import {
  clearIngestEvalRunOverlayForTests,
  listLatestIngestEvalRun,
  recordIngestEvalRun,
} from "../ingestEvalRuns"

test("record then latest by publisher name", async () => {
  clearIngestEvalRunOverlayForTests()
  await recordIngestEvalRun({
    publisherId: 35,
    publisherName: "JCDecaux",
    fixtureId: "jcd",
    corpusKind: "golden",
    lineCount: 95,
    moneyPct: 1,
    datesPct: 1,
    formatPct: 1,
    placementPct: 1,
    buyTypePct: 1,
    overallPct: 1,
    scores: { fixtures: ["jcd"] },
  })
  await recordIngestEvalRun({
    publisherId: 19,
    publisherName: "SEN",
    fixtureId: "sen",
    corpusKind: "golden",
    lineCount: 21,
    moneyPct: 1,
    datesPct: 1,
    formatPct: 0.5,
    placementPct: 1,
    buyTypePct: 1,
    overallPct: 0.9,
    scores: { fixtures: ["sen"] },
  })
  const jcd = await listLatestIngestEvalRun({ publisherName: "JCDecaux" })
  assert.equal(jcd?.lineCount, 95)
  assert.equal(jcd?.overallPct, 1)
  const sen = await listLatestIngestEvalRun({ publisherName: "SEN" })
  assert.equal(sen?.overallPct, 0.9)
})
