import assert from "node:assert/strict"
import path from "node:path"
import test from "node:test"
import { acceptIngestProposalTool } from "../acceptIngestProposal.js"
import { getPendingIngestReviewTool } from "../getPendingIngestReview.js"
import type { AvaToolContext } from "../types.js"
import { buildIngestReviewFromFile } from "@/lib/mediaplans/ingest/buildIngestReview"
import { loadSeedPublisherProfiles } from "@/lib/mediaplans/ingest/loadPublisherProfiles"
import {
  clearIngestStageForTests,
  getIngestStage,
  putIngestStage,
  setIngestStageExpiresAtForTests,
} from "@/lib/mediaplans/ingest/ingestStageStore"
import { clearIngestRunOverlayForTests } from "@/lib/mediaplans/ingest/ingestRuns"
import { setExecuteIngestAcceptDepsForTests } from "@/lib/mediaplans/ingest/executeIngestAccept"
import { clearPublisherProfileSeedOverlayForTests } from "@/lib/mediaplans/ingest/persistColumnRemap"
import { summariseIngestReview } from "@/lib/mediaplans/ingest/summariseIngestReview"
import type { AvaColumnMappingProposal } from "@/lib/mediaplans/ingest/avaColumnMapping"

const FIX = path.join(process.cwd(), "tests/fixtures/ava-plans")
const QMS = "qms_strength-meals_esb-ooh.xlsx"
const JCD = "jcd_strength-meals_ooh.xlsx"
const LEAVE_UNMAPPED = "Leave unmapped"

function ctx(overrides: Partial<AvaToolContext> = {}): AvaToolContext {
  return {
    pageContext: undefined,
    clientSlug: undefined,
    mbaNumber: undefined,
    versionNumber: undefined,
    enabledMediaTypes: undefined,
    userSub: "u1",
    userEmail: "ava@assembledmedia.com.au",
    roles: ["admin"],
    clientSlugs: [],
    mbaNumbers: [],
    capturedPatch: null,
    capturedAttachments: null,
    capturedQuestions: null,
    pendingParsedPlan: null,
    pendingIngest: null,
    capturedLineItemsLoad: null,
    currentLineItems: null,
    ...overrides,
  }
}

test.beforeEach(() => {
  clearIngestStageForTests()
  clearIngestRunOverlayForTests()
  clearPublisherProfileSeedOverlayForTests()
  setExecuteIngestAcceptDepsForTests(null)
})

test.afterEach(() => {
  setExecuteIngestAcceptDepsForTests(null)
})

function suggestionLabel(canon: string): string {
  return `${canon} (AVA suggestion)`
}

test("get_pending_ingest_review confirmed block is markdown from the staged package, never invented", async () => {
  const hub = await buildIngestReviewFromFile(
    path.join(FIX, QMS),
    loadSeedPublisherProfiles(),
    { skipAva: true },
  )
  const stageId = await putIngestStage({
    review: hub,
    fileName: QMS,
    uploadedBy: "ava@assembledmedia.com.au",
  })
  const summary = summariseIngestReview(hub, { stageId, fileName: QMS })
  const out = await getPendingIngestReviewTool.execute(
    {},
    ctx({ pendingIngest: { stageId, fileName: QMS }, mbaNumber: "qmsround01" }),
  )
  assert.equal(out.isError, false)
  assert.notEqual(out.content.trimStart()[0], "{")
  assert.match(out.content, /\| Publisher \|/i)
  assert.match(out.content, /\| Media type \|/i)
  assert.match(out.content, /Lines \/ panels \/ bursts/i)
  assert.match(out.content, /Required coverage/i)
  assert.match(out.content, /Money delta vs file total/i)
  assert.ok(summary.detected_publisher)
  assert.match(out.content, new RegExp(summary.detected_publisher!))
  assert.match(
    out.content,
    new RegExp(String(summary.line_item_count)),
  )
  assert.match(
    out.content,
    new RegExp(String(summary.panel_count)),
  )
  const confPct = `${Math.round(summary.publisher_confidence * 100)}%`
  assert.match(out.content, new RegExp(confPct.replace("%", "\\%")))
  const fileHits = out.content.split(QMS).length - 1
  assert.ok(fileHits <= 1, `file name restated ${fileHits} times`)
  assert.doesNotMatch(out.content, /call get_pending_ingest_review/i)
  assert.doesNotMatch(out.content, /do not invent/i)
})

test("get_pending_ingest_review names JCD ignored rows in the confirmed block", async () => {
  const hub = await buildIngestReviewFromFile(
    path.join(FIX, JCD),
    loadSeedPublisherProfiles(),
    { skipAva: true },
  )
  const stageId = await putIngestStage({
    review: hub,
    fileName: JCD,
    uploadedBy: "ava@assembledmedia.com.au",
  })
  const out = await getPendingIngestReviewTool.execute(
    {},
    ctx({
      pendingIngest: { stageId, fileName: JCD },
      mbaNumber: "jcd001",
    }),
  )
  assert.equal(out.isError, false)
  assert.match(out.content, /MEDIA VALUE/i)
  assert.match(out.content, /DISCOUNT/i)
  assert.match(out.content, /CAMPAIGN SUMMARY/i)
})

test("suggestion card offers AVA's proposal first plus Leave unmapped", async () => {
  const hub = await buildIngestReviewFromFile(
    path.join(FIX, QMS),
    loadSeedPublisherProfiles(),
    { skipAva: true },
  )
  const proposal: AvaColumnMappingProposal = {
    header: "MINIMUM INSTALL",
    sample_values: ["6 sheet"],
    proposed_mapped_to: "format",
    reasoning: "format-like leftovers",
  }
  hub.ava_mapping_proposals = [proposal]
  const stageId = await putIngestStage({
    review: hub,
    fileName: QMS,
    uploadedBy: "ava@assembledmedia.com.au",
  })
  const out = await getPendingIngestReviewTool.execute(
    {},
    ctx({ pendingIngest: { stageId, fileName: QMS }, mbaNumber: "qmsround01" }),
  )
  assert.equal(out.isError, false)
  const card = (out.questions ?? []).find((q) =>
    /MINIMUM INSTALL/i.test(`${q.id} ${q.text}`),
  )
  assert.ok(card, "expected a suggestion card for MINIMUM INSTALL")
  assert.equal(card.type, "choice")
  assert.ok(card.options && card.options.length >= 2)
  assert.equal(card.options[0], suggestionLabel("format"))
  assert.ok(card.options.includes(LEAVE_UNMAPPED))
})

test("two open ingest cards: confirming one leaves the other outstanding", async () => {
  const hub = await buildIngestReviewFromFile(
    path.join(FIX, QMS),
    loadSeedPublisherProfiles(),
    { skipAva: true },
  )
  hub.ava_mapping_proposals = [
    {
      header: "MINIMUM INSTALL",
      sample_values: [],
      proposed_mapped_to: "format",
      reasoning: "a",
    },
    {
      header: "PANEL EXCLUSIVITY",
      sample_values: [],
      proposed_mapped_to: "size",
      reasoning: "b",
    },
  ]
  const stageId = await putIngestStage({
    review: hub,
    fileName: QMS,
    uploadedBy: "ava@assembledmedia.com.au",
  })
  const c = ctx({
    pendingIngest: { stageId, fileName: QMS },
    mbaNumber: "qmsround01",
  })
  const first = await getPendingIngestReviewTool.execute({}, c)
  const open = (first.questions ?? []).filter(
    (q) =>
      q.id === "ingest:map:MINIMUM INSTALL" ||
      q.id === "ingest:map:PANEL EXCLUSIVITY",
  )
  assert.equal(open.length, 2)
  const confirm = open.find((q) => /MINIMUM INSTALL/i.test(`${q.id} ${q.text}`))
  const keep = open.find((q) => /PANEL EXCLUSIVITY/i.test(`${q.id} ${q.text}`))
  assert.ok(confirm && keep)
  const pick = confirm.options?.[0]
  assert.ok(pick)
  const second = await getPendingIngestReviewTool.execute(
    { answers: [{ questionId: confirm.id, answer: pick }] },
    c,
  )
  assert.equal(second.isError, false)
  assert.doesNotMatch(second.content, /\| Publisher \|/i)
  const staged = await getIngestStage(stageId)
  assert.ok(staged)
  assert.deepEqual(
    (staged.review.ava_mapping_proposals ?? []).map((p) => p.header),
    ["PANEL EXCLUSIVITY"],
  )
  const reemitted = (second.questions ?? []).some((q) => q.id === keep.id)
  assert.ok(
    reemitted ||
      (staged.review.ava_mapping_proposals ?? []).some(
        (p) => p.header === "PANEL EXCLUSIVITY",
      ),
    "unconfirmed PANEL EXCLUSIVITY card must remain outstanding",
  )
})

test("JCD money-mapping columns get their own card that warns recon re-runs", async () => {
  const hub = await buildIngestReviewFromFile(
    path.join(FIX, JCD),
    loadSeedPublisherProfiles(),
    { skipAva: true },
  )
  const stageId = await putIngestStage({
    review: hub,
    fileName: JCD,
    uploadedBy: "ava@assembledmedia.com.au",
  })
  const out = await getPendingIngestReviewTool.execute(
    {},
    ctx({ pendingIngest: { stageId, fileName: JCD }, mbaNumber: "jcd001" }),
  )
  assert.equal(out.isError, false)
  const moneyCards = (out.questions ?? []).filter((q) =>
    /0\.5%|reconcil/i.test(q.text),
  )
  assert.ok(moneyCards.length >= 1, "expected money-mapping cards")
  const hay = moneyCards.map((q) => q.text).join(" | ")
  assert.match(hay, /MEDIA VALUE/i)
  assert.match(hay, /PRODUCTION|Production Charge/i)
  assert.match(hay, /MEDIA BOUGHT RATE/i)
})

test("MBA card is a campaign single-select, not free text, when page has no MBA", async () => {
  const hub = await buildIngestReviewFromFile(
    path.join(FIX, QMS),
    loadSeedPublisherProfiles(),
    { skipAva: true },
  )
  const stageId = await putIngestStage({
    review: hub,
    fileName: QMS,
    uploadedBy: "ava@assembledmedia.com.au",
  })
  const out = await getPendingIngestReviewTool.execute(
    {},
    ctx({
      pendingIngest: { stageId, fileName: QMS },
      mbaNumber: undefined,
      mbaNumbers: ["qmsround01", "golf009"],
    }),
  )
  assert.equal(out.isError, false)
  const mba = (out.questions ?? []).find((q) => /mba|campaign/i.test(q.text))
  assert.ok(mba, "expected an MBA/campaign card")
  assert.equal(mba.type, "choice")
  assert.notEqual(mba.type, "text")
  assert.ok(mba.options?.some((o) => /qmsround01/i.test(o)))
  assert.ok(mba.options?.some((o) => /golf009/i.test(o)))
})

test("get_pending_ingest_review returns Hub-matching summary for staged QMS", async () => {
  const hub = await buildIngestReviewFromFile(
    path.join(FIX, QMS),
    loadSeedPublisherProfiles(),
    { skipAva: true },
  )
  const stageId = await putIngestStage({
    review: hub,
    fileName: QMS,
    uploadedBy: "ava@assembledmedia.com.au",
  })
  const c = ctx({
    pendingIngest: { stageId, fileName: QMS },
  })
  const out = await getPendingIngestReviewTool.execute({}, c)
  assert.equal(out.isError, false)
  assert.match(out.content, /QMS/)
  assert.match(
    out.content,
    new RegExp(String(hub.proposal!.reconciliation.line_item_count)),
  )
})

test("accept_ingest_proposal refuses without confirm", async () => {
  const denied = await acceptIngestProposalTool.execute({ confirm: false }, ctx())
  assert.equal(denied.isError, true)
  assert.match(denied.content, /confirm/i)
})

test("accept_ingest_proposal asks for MBA when not inferable — never guesses", async () => {
  const hub = await buildIngestReviewFromFile(
    path.join(FIX, QMS),
    loadSeedPublisherProfiles(),
    { skipAva: true },
  )
  const stageId = await putIngestStage({
    review: hub,
    fileName: QMS,
    uploadedBy: "ava@assembledmedia.com.au",
  })
  const c = ctx({
    mbaNumber: undefined,
    pendingIngest: { stageId, fileName: QMS },
  })
  const denied = await acceptIngestProposalTool.execute({ confirm: true }, c)
  assert.equal(denied.isError, true)
  assert.match(denied.content, /campaign/i)
  assert.match(denied.content, /won'?t guess/i)
})

test("accept_ingest_proposal confirm with page MBA accepts via shared engine", async () => {
  const hub = await buildIngestReviewFromFile(
    path.join(FIX, QMS),
    loadSeedPublisherProfiles(),
    { skipAva: true },
  )
  const stageId = await putIngestStage({
    review: hub,
    fileName: QMS,
    uploadedBy: "ava@assembledmedia.com.au",
  })
  let saved = 0
  setExecuteIngestAcceptDepsForTests({
    resolveCampaign: async (mba) => ({
      masterId: 42,
      mbaNumber: mba,
      versionNumber: 1,
      mode: "draft",
    }),
    savePlanVersion: async (input) => {
      saved = input.lineItems.length
      return { versionId: 7, versionNumber: 1, lineCount: saved }
    },
    insertPanels: async () => 0,
  })
  const c = ctx({
    mbaNumber: "qmsround01",
    pendingIngest: { stageId, fileName: QMS },
  })
  const ok = await acceptIngestProposalTool.execute({ confirm: true }, c)
  assert.equal(ok.isError, false)
  assert.ok(saved > 0)
  assert.match(ok.content, /it's in/i)
})

test("accept_ingest_proposal money-blocked explains the delta in chat", async () => {
  const hub = await buildIngestReviewFromFile(
    path.join(FIX, QMS),
    loadSeedPublisherProfiles(),
    { skipAva: true },
  )
  hub.proposal!.reconciliation = {
    ...hub.proposal!.reconciliation,
    accept_ok: false,
    delta: 999,
    delta_pct: 0.08,
    block_reason: "Computed media $1.00 diverges from file stated $2.00 by 8.00% (limit 0.5%)",
  }
  const stageId = await putIngestStage({
    review: hub,
    fileName: QMS,
    uploadedBy: "ava@assembledmedia.com.au",
  })
  setExecuteIngestAcceptDepsForTests({
    resolveCampaign: async (mba) => ({
      masterId: 1,
      mbaNumber: mba,
      versionNumber: 1,
      mode: "draft",
    }),
    savePlanVersion: async () => {
      throw new Error("must not save on 409")
    },
    insertPanels: async () => 0,
  })
  const c = ctx({
    mbaNumber: "qmsround01",
    pendingIngest: { stageId, fileName: QMS },
  })
  const blocked = await acceptIngestProposalTool.execute({ confirm: true }, c)
  assert.equal(blocked.isError, true)
  assert.match(blocked.content, /8\.00%|diverges|delta/i)
})

test("get_pending_ingest_review with no stageId asks to attach a file", async () => {
  const out = await getPendingIngestReviewTool.execute({}, ctx())
  assert.equal(out.isError, true)
  assert.match(out.content, /no schedule attached/i)
  assert.doesNotMatch(out.content, /expired/i)
  assert.doesNotMatch(out.content, /get_pending_ingest_review|stageId|ingest_stages/i)
  assert.equal(out.ingestStageMissing, undefined)
})

test("get_pending_ingest_review missing stage is not expiry", async () => {
  const stageId = "stage-gone-123"
  const out = await getPendingIngestReviewTool.execute(
    {},
    ctx({ pendingIngest: { stageId, fileName: QMS } }),
  )
  assert.equal(out.isError, true)
  assert.equal(out.ingestStageMissing, true)
  assert.doesNotMatch(out.content, /expired/i)
  assert.doesNotMatch(out.content, /24 hours/i)
  assert.doesNotMatch(out.content, new RegExp(stageId))
  assert.doesNotMatch(out.content, /known server-side limitation/i)
  assert.match(out.content, /isn't available/i)
  assert.match(out.content, /not something you did/i)
  assert.match(out.content, /Attach the file again/i)
})

test("get_pending_ingest_review expired stage names the 24 hour hold, not expiry jargon", async () => {
  const hub = await buildIngestReviewFromFile(
    path.join(FIX, QMS),
    loadSeedPublisherProfiles(),
    { skipAva: true },
  )
  const stageId = await putIngestStage({
    review: hub,
    fileName: QMS,
    uploadedBy: "ava@assembledmedia.com.au",
  })
  setIngestStageExpiresAtForTests(
    stageId,
    new Date(Date.now() - 1000).toISOString(),
  )
  const out = await getPendingIngestReviewTool.execute(
    {},
    ctx({ pendingIngest: { stageId, fileName: QMS } }),
  )
  assert.equal(out.isError, true)
  assert.equal(out.ingestStageMissing, true)
  assert.match(out.content, /24 hours/i)
  assert.doesNotMatch(out.content, /expired/i)
  assert.doesNotMatch(out.content, new RegExp(stageId))
  assert.doesNotMatch(out.content, /known server-side limitation/i)
  assert.match(out.content, /not something you did/i)
  assert.match(out.content, /Attach the file again/i)
})
