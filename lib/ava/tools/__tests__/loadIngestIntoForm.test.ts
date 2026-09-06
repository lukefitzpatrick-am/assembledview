/**
 * load_ingest_into_form + surface-aware accept_ingest_proposal offer.
 */
import assert from "node:assert/strict"
import path from "node:path"
import test from "node:test"
import { buildAvaSystemPrompt } from "@/lib/ava/buildAvaSystemPrompt"
import type { PageContext } from "@/lib/ava/types"
import { buildIngestReviewFromFile } from "@/lib/mediaplans/ingest/buildIngestReview"
import type { IngestReviewPackage } from "@/lib/mediaplans/ingest/buildIngestReview"
import {
  clearIngestRunOverlayForTests,
  listIngestRuns,
} from "@/lib/mediaplans/ingest/ingestRuns"
import {
  clearIngestStageForTests,
  patchIngestStageReview,
  putIngestStage,
} from "@/lib/mediaplans/ingest/ingestStageStore"
import { loadSeedPublisherProfiles } from "@/lib/mediaplans/ingest/loadPublisherProfiles"
import { loadIngestIntoFormTool } from "../loadIngestIntoForm.js"
import { avaToolDefinitionsForPage } from "../pageToolOffer.js"
import type { AvaToolContext } from "../types.js"

const FIX = path.join(process.cwd(), "tests/fixtures/ava-plans")
const QMS = "qms_strength-meals_esb-ooh.xlsx"
const MONEY_BLOCK =
  "Computed media $1.00 diverges from file stated $2.00 by 8.00% (limit 0.5%)"

const OFFERED = [
  { name: "get_pending_ingest_review" },
  { name: "accept_ingest_proposal" },
  { name: "load_ingest_into_form" },
] as const

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
    pendingIngest: {
      stageId: "stage-should-not-be-touched",
      fileName: "qms.xlsx",
    },
    capturedLineItemsLoad: null,
    currentLineItems: null,
    ...overrides,
  }
}

function toolNames(pageContext?: PageContext) {
  return avaToolDefinitionsForPage(OFFERED, pageContext).map((t) => t.name)
}

function unmatchRequired(
  review: IngestReviewPackage,
  ids: string[],
): IngestReviewPackage {
  const coverage = review.template_coverage
  if (!coverage) return review
  const want = new Set(ids)
  const required = coverage.required.map((f) =>
    want.has(f.id) ? { ...f, matched: false } : f,
  )
  return {
    ...review,
    template_coverage: {
      ...coverage,
      required,
      required_matched: required.filter((f) => f.matched).length,
    },
  }
}

function rematchRequired(
  review: IngestReviewPackage,
  ids: string[],
): IngestReviewPackage {
  const coverage = review.template_coverage
  if (!coverage) return review
  const want = new Set(ids)
  const required = coverage.required.map((f) =>
    want.has(f.id) ? { ...f, matched: true, source: { kind: "header" as const } } : f,
  )
  return {
    ...review,
    template_coverage: {
      ...coverage,
      required,
      required_matched: required.filter((f) => f.matched).length,
    },
  }
}

function withoutUnresolved(
  review: IngestReviewPackage,
): IngestReviewPackage {
  if (!review.template_coverage) return review
  return {
    ...review,
    template_coverage: {
      ...review.template_coverage,
      unresolved_controlled: [],
    },
  }
}

async function stageQms(
  mutate?: (review: IngestReviewPackage) => IngestReviewPackage,
): Promise<{ stageId: string; review: IngestReviewPackage }> {
  const hub = await buildIngestReviewFromFile(
    path.join(FIX, QMS),
    loadSeedPublisherProfiles(),
    { skipAva: true },
  )
  const review = mutate ? mutate(hub) : hub
  const stageId = await putIngestStage({
    review,
    fileName: QMS,
    uploadedBy: "ava@assembledmedia.com.au",
  })
  return { stageId, review }
}

test.beforeEach(() => {
  clearIngestStageForTests()
  clearIngestRunOverlayForTests()
})

test("buildTools excludes accept_ingest_proposal on create", () => {
  const names = toolNames({ route: "/mediaplans/create" })
  assert.equal(names.includes("accept_ingest_proposal"), false)
  assert.equal(names.includes("load_ingest_into_form"), true)
})

test("buildTools excludes accept_ingest_proposal on edit", () => {
  const names = toolNames({
    route: { pathname: "/mediaplans/mba/qmsround01/edit" },
  })
  assert.equal(names.includes("accept_ingest_proposal"), false)
  assert.equal(names.includes("load_ingest_into_form"), true)
})

test("buildTools includes accept_ingest_proposal on the Hub route", () => {
  const names = toolNames({ route: "/admin/schedule-ingest" })
  assert.equal(names.includes("accept_ingest_proposal"), true)
  assert.equal(names.includes("load_ingest_into_form"), true)
})

test("buildTools excludes accept_ingest_proposal when the route is absent", () => {
  assert.equal(toolNames(undefined).includes("accept_ingest_proposal"), false)
  assert.equal(
    toolNames({}).includes("accept_ingest_proposal"),
    false,
  )
})

test("load_ingest_into_form without confirm: true refuses and writes nothing", async () => {
  const c = ctx()
  const denied = await loadIngestIntoFormTool.execute({ confirm: false }, c)
  assert.equal(denied.isError, true)
  assert.match(denied.content, /load_ingest_into_form refused: confirm must be true/)
  assert.equal(c.capturedLineItemsLoad, null)
  assert.doesNotMatch(denied.content, /expired/i)
  assert.doesNotMatch(denied.content, /stage-should-not-be-touched/)
})

test("create/edit system prompt loads into the form and does not describe accepting into a plan", () => {
  const create = buildAvaSystemPrompt("mediaplan_create", {
    route: "/mediaplans/create",
  })
  assert.match(create, /load_ingest_into_form/)
  assert.match(create, /form for human review/i)
  assert.doesNotMatch(
    create.slice(create.toLowerCase().lastIndexOf("on this media-plan")),
    /accept_ingest_proposal/,
  )
  const edit = buildAvaSystemPrompt("mediaplan_edit", {
    route: { pathname: "/mediaplans/mba/foo/edit" },
  })
  assert.match(edit, /load_ingest_into_form/)
  assert.doesNotMatch(edit, /accept the schedule into a plan/i)
})

test("money-fail file refuses load, sets no load, and writes one blocked run", async () => {
  const { stageId } = await stageQms((review) => {
    assert.ok(review.proposal)
    return {
      ...review,
      proposal: {
        ...review.proposal,
        reconciliation: {
          ...review.proposal.reconciliation,
          accept_ok: false,
          delta: 999,
          delta_pct: 0.08,
          block_reason: MONEY_BLOCK,
        },
      },
    }
  })
  const c = ctx({ pendingIngest: { stageId, fileName: QMS } })
  const refused = await loadIngestIntoFormTool.execute({ confirm: true }, c)
  assert.equal(refused.isError, true)
  assert.equal(c.capturedLineItemsLoad, null)
  assert.equal(refused.block_reason, MONEY_BLOCK)
  assert.equal(refused.delta, 999)
  assert.match(refused.content, /8\.00%|diverges|delta/i)
  assert.match(refused.content, /\$1\.00/)
  const blocked = (await listIngestRuns({ publisherName: "QMS" })).filter(
    (r) => r.outcome === "blocked" && r.outcomeReason === MONEY_BLOCK,
  )
  assert.equal(blocked.length, 1)
  assert.equal(blocked[0]!.moneyDelta, 999)
})

test("required-field-fail file refuses load, names the fields, and writes no run", async () => {
  const { stageId, review } = await stageQms((hub) =>
    withoutUnresolved(unmatchRequired(hub, ["media_money"])),
  )
  const missing = review.template_coverage?.required.find((f) => f.id === "media_money")
  assert.equal(missing?.matched, false)
  const c = ctx({ pendingIngest: { stageId, fileName: QMS } })
  const blockedBefore = (await listIngestRuns({ publisherName: "QMS" })).filter(
    (r) => r.outcome === "blocked",
  ).length
  const refused = await loadIngestIntoFormTool.execute({ confirm: true }, c)
  assert.equal(refused.isError, true)
  assert.equal(c.capturedLineItemsLoad, null)
  assert.match(refused.content, /Media money/i)
  assert.match(refused.content, /no source column/i)
  const blockedAfter = (await listIngestRuns({ publisherName: "QMS" })).filter(
    (r) => r.outcome === "blocked",
  ).length
  assert.equal(blockedAfter, blockedBefore)
})

test("loadIngestIntoForm refuses when an unresolved value is outstanding and names the value", async () => {
  const { stageId, review } = await stageQms()
  const digital = (review.template_coverage?.unresolved_controlled ?? []).find(
    (item) => /digital/i.test(item.raw),
  )
  assert.ok(digital, "QMS fixture must still raise Digital as unresolved")
  const c = ctx({ pendingIngest: { stageId, fileName: QMS } })
  const refused = await loadIngestIntoFormTool.execute({ confirm: true }, c)
  assert.equal(refused.isError, true)
  assert.equal(c.capturedLineItemsLoad, null)
  assert.match(refused.content, /Digital/)
  assert.match(refused.content, /value card/i)
})

test("clean file loads into the form as it does now", async () => {
  const { stageId } = await stageQms(withoutUnresolved)
  const c = ctx({ pendingIngest: { stageId, fileName: QMS } })
  const ok = await loadIngestIntoFormTool.execute({ confirm: true }, c)
  assert.equal(ok.isError, false)
  assert.ok(c.capturedLineItemsLoad)
  assert.equal(c.capturedLineItemsLoad.channel, "ooh")
  assert.ok(c.capturedLineItemsLoad.items.length > 0)
  assert.equal(c.capturedLineItemsLoad.replace, true)
  assert.equal(c.capturedLineItemsLoad.ingestStageId, stageId)
  assert.match(ok.content, /line item/)
  assert.match(ok.content, /form/)
  assert.doesNotMatch(ok.content, /expired/i)
  assert.doesNotMatch(ok.content, /switched on/i)
  const blocked = (await listIngestRuns({ publisherName: "QMS" })).filter(
    (r) => r.outcome === "blocked" && r.outcomeReason === MONEY_BLOCK,
  )
  assert.equal(blocked.length, 0)
})

test("load says the channel will be switched on when enabledMediaTypes omits it", async () => {
  const { stageId } = await stageQms(withoutUnresolved)
  const c = ctx({
    pendingIngest: { stageId, fileName: QMS },
    enabledMediaTypes: ["radio", "bvod", "socialMedia"],
    pageContext: {
      entities: { enabledMediaTypes: ["radio", "bvod", "socialMedia"] },
    },
  })
  const ok = await loadIngestIntoFormTool.execute({ confirm: true }, c)
  assert.equal(ok.isError, false)
  assert.ok(c.capturedLineItemsLoad)
  assert.match(ok.content, /switched on/i)
  assert.match(ok.content, /OOH/i)
  assert.match(ok.content, /Nothing has been saved/)
})

test("load does not say switched on when the channel is already enabled", async () => {
  const { stageId } = await stageQms(withoutUnresolved)
  const c = ctx({
    pendingIngest: { stageId, fileName: QMS },
    enabledMediaTypes: ["ooh", "radio"],
    pageContext: {
      entities: { enabledMediaTypes: ["ooh", "radio"] },
    },
  })
  const ok = await loadIngestIntoFormTool.execute({ confirm: true }, c)
  assert.equal(ok.isError, false)
  assert.doesNotMatch(ok.content, /switched on/i)
})

test("client/MBA mismatch does not block load", async () => {
  const { stageId } = await stageQms(withoutUnresolved)
  const c = ctx({
    pendingIngest: { stageId, fileName: QMS },
    mbaNumber: "glenda008",
    clientSlug: "glenda",
    pageContext: {
      entities: {
        mbaNumber: "glenda008",
        clientName: "Glenda",
        enabledMediaTypes: ["radio"],
      },
    },
  })
  const ok = await loadIngestIntoFormTool.execute({ confirm: true }, c)
  assert.equal(ok.isError, false)
  assert.ok(c.capturedLineItemsLoad)
})

test("retry after remap succeeds", async () => {
  const { stageId, review } = await stageQms((hub) =>
    unmatchRequired(hub, ["media_money"]),
  )
  const blockedBefore = (await listIngestRuns({ publisherName: "QMS" })).filter(
    (r) => r.outcome === "blocked",
  ).length
  const first = ctx({ pendingIngest: { stageId, fileName: QMS } })
  const refused = await loadIngestIntoFormTool.execute({ confirm: true }, first)
  assert.equal(refused.isError, true)
  assert.equal(first.capturedLineItemsLoad, null)
  assert.match(refused.content, /Media money/i)

  await patchIngestStageReview(
    stageId,
    withoutUnresolved(rematchRequired(review, ["media_money"])),
  )
  const retry = ctx({ pendingIngest: { stageId, fileName: QMS } })
  const ok = await loadIngestIntoFormTool.execute({ confirm: true }, retry)
  assert.equal(ok.isError, false)
  assert.ok(retry.capturedLineItemsLoad)
  assert.ok(retry.capturedLineItemsLoad.items.length > 0)
  const blockedAfter = (await listIngestRuns({ publisherName: "QMS" })).filter(
    (r) => r.outcome === "blocked",
  ).length
  assert.equal(blockedAfter, blockedBefore)
})
