/**
 * ON-3 / AV-ING-2 — AVA chat ingest door shares the Hub engine.
 * Same fixture → same review numbers; confirm uses executeIngestAccept;
 * money gate 409 + ingest_runs blocked; unknown publisher never guessed.
 */
import assert from "node:assert/strict"
import path from "node:path"
import test from "node:test"
import ExcelJS from "exceljs"
import { buildIngestReviewFromFile } from "../buildIngestReview"
import { loadSeedPublisherProfiles } from "../loadPublisherProfiles"
import {
  clearIngestRunOverlayForTests,
  listIngestRuns,
} from "../ingestRuns"
import {
  clearIngestStageForTests,
  getIngestStage,
  putIngestStage,
} from "../ingestStageStore"
import { summariseIngestReview } from "../summariseIngestReview"
import { stageIngestReviewFromBuffer } from "../stageIngestReview"
import { executeIngestAccept } from "../executeIngestAccept"
import { hydrateOohEditorLine } from "../hydrateEditorCard"
import { mapLineItemFromPostgres } from "@/lib/data/planShapes"
import { parseBurstMoney } from "@/lib/mediaplan/formatBurstsForPersist"
import type { SavePlanLineItem } from "@/lib/data/savePlan"

const FIX = path.join(process.cwd(), "tests/fixtures/ava-plans")
const QMS = "qms_strength-meals_esb-ooh.xlsx"
const CAMPAIGN_START = new Date(2026, 7, 1)
const CAMPAIGN_END = new Date(2026, 7, 31)

test.beforeEach(() => {
  clearIngestStageForTests()
  clearIngestRunOverlayForTests()
})

test("chat review summary matches Hub review numbers for the same QMS fixture", async () => {
  const profiles = loadSeedPublisherProfiles()
  const hub = await buildIngestReviewFromFile(path.join(FIX, QMS), profiles, {
    skipAva: true,
  })
  const buf = await (await import("node:fs/promises")).readFile(
    path.join(FIX, QMS),
  )
  const staged = await stageIngestReviewFromBuffer(Buffer.from(buf), {
    fileName: QMS,
    uploadedBy: "ava@assembledmedia.com.au",
    profiles,
  })
  const chat = summariseIngestReview(staged.review, {
    stageId: staged.stageId,
    fileName: QMS,
  })
  const recon = hub.proposal!.reconciliation
  assert.equal(chat.detected_publisher, hub.detected_publisher)
  assert.equal(chat.publisher_confidence, hub.publisher_confidence)
  assert.equal(chat.media_type, hub.proposal!.media_type)
  assert.equal(chat.line_item_count, recon.line_item_count)
  assert.equal(chat.panel_count, recon.panel_count)
  assert.equal(chat.burst_count, recon.burst_count)
  assert.equal(chat.money_delta, recon.delta)
  assert.equal(chat.money_delta_pct, recon.delta_pct)
  assert.equal(chat.accept_ok, recon.accept_ok)
  assert.deepEqual(chat.ignored, hub.ignored.spoken)
  assert.deepEqual(chat.columns_unmapped, hub.ignored.columns_unmapped)
  assert.equal(typeof chat.required_coverage, "number")
  assert.ok(chat.required_coverage >= 0 && chat.required_coverage <= 1)
  assert.equal(chat.unknown_publisher, false)
  assert.ok(chat.full_review_path.includes(staged.stageId))
  assert.equal(getIngestStage(staged.stageId)?.review.detected_publisher, "QMS")
})

test("stage store round-trips the same package Hub would show", async () => {
  const profiles = loadSeedPublisherProfiles()
  const hub = await buildIngestReviewFromFile(path.join(FIX, QMS), profiles, {
    skipAva: true,
  })
  const id = putIngestStage({
    review: hub,
    fileName: QMS,
    uploadedBy: "luke@assembledmedia.com.au",
  })
  const got = getIngestStage(id)
  assert.ok(got)
  assert.equal(got.fileName, QMS)
  assert.equal(got.review.detected_publisher, hub.detected_publisher)
  assert.equal(
    got.review.proposal!.reconciliation.line_item_count,
    hub.proposal!.reconciliation.line_item_count,
  )
})

test("confirm-in-chat accept hydrates the editor card (MR-12 QMS round-trip)", async () => {
  const profiles = loadSeedPublisherProfiles()
  const hub = await buildIngestReviewFromFile(path.join(FIX, QMS), profiles, {
    skipAva: true,
  })
  const stageId = putIngestStage({
    review: hub,
    fileName: QMS,
    uploadedBy: "ava@assembledmedia.com.au",
  })
  let savedLines: SavePlanLineItem[] = []
  const result = await executeIngestAccept({
    stageId,
    mbaNumber: "qmsround01",
    uploadedBy: "ava@assembledmedia.com.au",
    confirm: true,
  }, {
    resolveCampaign: async (mba) => ({
      masterId: 1,
      mbaNumber: mba,
      versionNumber: 1,
      mode: "draft",
    }),
    savePlanVersion: async (input) => {
      savedLines = input.lineItems
      return { versionId: 9, versionNumber: 1, lineCount: input.lineItems.length }
    },
    insertPanels: async () => 0,
  })
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.ok(savedLines.length > 0)
  const line = savedLines[0]!
  const assembled = mapLineItemFromPostgres(
    {
      id: 1,
      channel: line.channel,
      lineItemId: line.lineItemId,
      position: line.position ?? 0,
      market: line.market,
      buyingDemo: line.buyingDemo,
      buyType: line.buyType,
      publisher: line.publisher,
      platform: line.platform ?? null,
      bidStrategy: line.bidStrategy ?? null,
      fixedCostMedia: line.fixedCostMedia ?? false,
      clientPaysForMedia: line.clientPaysForMedia ?? false,
      budgetIncludesFees: line.budgetIncludesFees ?? false,
      noAdserving: line.noAdserving ?? true,
      bursts: line.bursts,
      attrs: line.attrs ?? {},
    },
    {
      versionId: 1,
      versionNumber: 1,
      mbaNumber: "qmsround01",
      mpClientName: "Test",
    },
  )
  const card = hydrateOohEditorLine(assembled, {
    campaignStartDate: CAMPAIGN_START,
    campaignEndDate: CAMPAIGN_END,
    feePct: 0,
  })
  assert.ok(card.network.trim(), "Network empty after chat accept")
  assert.ok(card.format.trim(), "Format empty after chat accept")
  assert.equal(card.buyType, "fixed")
  assert.ok(card.bursts.length > 0)
  const money = card.bursts.reduce((s, b) => s + parseBurstMoney(b.budget), 0)
  assert.ok(money > 0, `money ${money}`)
  const runs = await listIngestRuns({ publisherName: "QMS" })
  assert.ok(runs.some((r) => r.outcome === "accepted" && r.uploadedBy === "ava@assembledmedia.com.au"))
})

test("money-blocked file refuses in chat with the delta and does not accept", async () => {
  const profiles = loadSeedPublisherProfiles()
  const hub = await buildIngestReviewFromFile(path.join(FIX, QMS), profiles, {
    skipAva: true,
  })
  assert.ok(hub.proposal)
  hub.proposal.reconciliation = {
    ...hub.proposal.reconciliation,
    accept_ok: false,
    delta: 1234.56,
    delta_pct: 0.02,
    block_reason:
      "Computed media $100.00 diverges from file stated $200.00 by 2.00% (limit 0.5%)",
  }
  const stageId = putIngestStage({
    review: hub,
    fileName: QMS,
    uploadedBy: "ava@assembledmedia.com.au",
  })
  let saves = 0
  const result = await executeIngestAccept({
    stageId,
    mbaNumber: "qmsround01",
    uploadedBy: "ava@assembledmedia.com.au",
    confirm: true,
  }, {
    resolveCampaign: async (mba) => ({
      masterId: 1,
      mbaNumber: mba,
      versionNumber: 1,
      mode: "draft",
    }),
    savePlanVersion: async (input) => {
      saves++
      return { versionId: 1, versionNumber: 1, lineCount: input.lineItems.length }
    },
    insertPanels: async () => 0,
  })
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.status, 409)
  assert.match(result.error, /2\.00%|delta|diverges/i)
  assert.equal(saves, 0)
  const runs = await listIngestRuns({ publisherName: "QMS" })
  const blocked = runs.find((r) => r.outcome === "blocked")
  assert.ok(blocked)
  assert.match(blocked.outcomeReason ?? "", /diverges|delta|2\.00%/i)
  assert.equal(blocked.uploadedBy, "ava@assembledmedia.com.au")
})

test("unknown publisher: no-profile reply, run recorded, never guessed", async () => {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet("Random")
  ws.addRow(["Completely Unique Header XYZ", "Another Weird Col"])
  ws.addRow(["nope", "nada"])
  const buf = Buffer.from(await wb.xlsx.writeBuffer())
  const staged = await stageIngestReviewFromBuffer(buf, {
    fileName: "mystery.xlsx",
    uploadedBy: "chat-user@assembledmedia.com.au",
    profiles: loadSeedPublisherProfiles(),
  })
  const summary = summariseIngestReview(staged.review, {
    stageId: staged.stageId,
    fileName: "mystery.xlsx",
  })
  assert.equal(summary.unknown_publisher, true)
  assert.match(summary.no_profile_message ?? "", /no publisher profile/i)
  assert.equal(summary.detected_publisher, null)
  const runs = await listIngestRuns({})
  assert.ok(
    runs.some(
      (r) =>
        r.fileName === "mystery.xlsx" &&
        r.uploadedBy === "chat-user@assembledmedia.com.au" &&
        /no publisher profile/i.test(r.outcomeReason ?? ""),
    ),
    `expected unknown-publisher run, got ${JSON.stringify(runs)}`,
  )
})

test("MBA missing: executeIngestAccept asks, never guesses, never saves", async () => {
  const profiles = loadSeedPublisherProfiles()
  const hub = await buildIngestReviewFromFile(path.join(FIX, QMS), profiles, {
    skipAva: true,
  })
  const stageId = putIngestStage({
    review: hub,
    fileName: QMS,
    uploadedBy: "ava@assembledmedia.com.au",
  })
  let resolveCalls = 0
  let saves = 0
  const result = await executeIngestAccept({
    stageId,
    mbaNumber: undefined,
    uploadedBy: "ava@assembledmedia.com.au",
    confirm: true,
  }, {
    resolveCampaign: async () => {
      resolveCalls++
      throw new Error("must not guess a campaign")
    },
    savePlanVersion: async (input) => {
      saves++
      return { versionId: 1, versionNumber: 1, lineCount: input.lineItems.length }
    },
    insertPanels: async () => 0,
  })
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.ask_mba, true)
  assert.match(result.error, /MBA/i)
  assert.equal(resolveCalls, 0)
  assert.equal(saves, 0)
})
