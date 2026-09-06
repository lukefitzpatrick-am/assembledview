/**
 * IG-13 — onboard a publisher from one unmatched file.
 * Proposed column_map + money_rules must match the hand-written seed.
 * Load is refused until the planner confirms the proposed profile.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"
import { detectWorkbookShapesFromFile } from "../detectShape"
import { loadSeedPublisherProfiles } from "../loadPublisherProfiles"
import {
  parsePublisherProfile,
  type PublisherProfileConfig,
} from "../publisherProfileConfig"
import { proposePublisherProfileFromShapes } from "../proposePublisherProfile"
import { buildIngestReviewFromFile } from "../buildIngestReview"
import { ingestReviewToFormLineItems } from "../toFormLineItems"
import { stageIngestReviewFromBuffer } from "../stageIngestReview"
import { loadIngestIntoFormTool } from "@/lib/ava/tools/loadIngestIntoForm"
import type { AvaToolContext } from "@/lib/ava/tools/types"
import {
  clearLinkedProfileOverlayForTests,
} from "../createLinkedPublisherProfile"
import {
  clearPublisherProfileSeedOverlayForTests,
  getPublisherProfileSeedAuditForTests,
  extraOverlayProfiles,
} from "../persistColumnRemap"
import { confirmProposedPublisherProfile } from "../confirmPublisherProfile"
import { listOpenIngestReviewQuestions } from "../ingestReviewQuestions"

const SEED_PATH = path.join(
  process.cwd(),
  "lib/mediaplans/ingest/seeds/publisherProfiles.json",
)
const JCD_FILE = path.join(
  process.cwd(),
  "tests/fixtures/ava-plans/jcd_strength-meals_ooh.xlsx",
)

function loadSeed(name: string): PublisherProfileConfig {
  const raw = JSON.parse(readFileSync(SEED_PATH, "utf8")) as unknown[]
  const row = raw.find(
    (r) =>
      (r as { publisher_name?: string }).publisher_name?.toLowerCase() ===
      name.toLowerCase(),
  )
  assert.ok(row, `missing seed ${name}`)
  return parsePublisherProfile(row)
}

function withoutPublisher(
  name: string,
): PublisherProfileConfig[] {
  return loadSeedPublisherProfiles().filter(
    (p) => p.publisher_name.toLowerCase() !== name.toLowerCase(),
  )
}

function emptyCtx(over: Partial<AvaToolContext> = {}): AvaToolContext {
  return {
    pageContext: { route: "/mediaplans/create" },
    clientSlug: undefined,
    mbaNumber: undefined,
    versionNumber: undefined,
    enabledMediaTypes: undefined,
    userSub: "u1",
    userEmail: "luke@assembledmedia.com.au",
    roles: ["admin"],
    clientSlugs: [],
    mbaNumbers: [],
    capturedPatch: null,
    capturedAttachments: null,
    capturedQuestions: null,
    pendingParsedPlan: null,
    capturedLineItemsLoad: null,
    currentLineItems: null,
    ...over,
  }
}

test("JCD file with no profile: proposed column_map and money_rules match the seed", async () => {
  const handwritten = loadSeed("JCDecaux")
  const shapes = await detectWorkbookShapesFromFile(JCD_FILE)
  const proposed = proposePublisherProfileFromShapes(shapes)
  assert.equal(proposed.media_type, "ooh")
  assert.deepEqual(proposed.column_map, handwritten.column_map)
  assert.deepEqual(proposed.money_rules, handwritten.money_rules)
})

test("unconfirmed proposed profile: load_ingest_into_form refuses", async () => {
  const buf = readFileSync(JCD_FILE)
  const staged = await stageIngestReviewFromBuffer(buf, {
    fileName: "jcd_strength-meals_ooh.xlsx",
    uploadedBy: "luke@assembledmedia.com.au",
    profiles: withoutPublisher("JCDecaux"),
  })
  assert.equal(staged.review.proposed_profile?.confirmed, false)
  assert.ok(staged.review.proposed_profile?.draft)
  const converted = ingestReviewToFormLineItems(staged.review)
  assert.equal(converted.items.length, 0)
  const out = await loadIngestIntoFormTool.execute(
    { confirm: true },
    emptyCtx({ pendingIngest: { stageId: staged.stageId } }),
  )
  assert.equal(out.isError, true)
  assert.match(out.content, /unconfirmed|confirm the proposed profile/i)
})

test("confirming the proposed profile inserts notes + audit, then load is allowed", async () => {
  clearLinkedProfileOverlayForTests()
  clearPublisherProfileSeedOverlayForTests()
  const buf = readFileSync(JCD_FILE)
  const staged = await stageIngestReviewFromBuffer(buf, {
    fileName: "jcd_strength-meals_ooh.xlsx",
    uploadedBy: "luke@assembledmedia.com.au",
    profiles: withoutPublisher("JCDecaux"),
  })
  const open = listOpenIngestReviewQuestions(staged.review, { mbaNumbers: [] })
  assert.ok(
    open.some((q) => q.id.startsWith("ingest:profile:")),
    `expected profile cards, got ${open.map((q) => q.id).join(",")}`,
  )
  const confirmed = await confirmProposedPublisherProfile({
    review: staged.review,
    confirmedBy: "luke@assembledmedia.com.au",
    catalogue: {
      id: 99,
      publisher_name: "Nova Outdoor",
      pub_ooh: true,
      pub_radio: false,
    },
  })
  assert.equal(confirmed.ok, true)
  if (!confirmed.ok) return
  assert.match(
    confirmed.profile.notes ?? "",
    /model-proposed, confirmed by luke@assembledmedia.com.au/i,
  )
  assert.equal(confirmed.profile.publisher_id, 99)
  const audit = getPublisherProfileSeedAuditForTests()
  assert.ok(audit.length > 0)
  assert.ok(audit.every((r) => r.changed_by === "luke@assembledmedia.com.au"))
  assert.ok(
    audit.some((r) => r.field === "column_map" && r.action === "map"),
  )
  const extras = extraOverlayProfiles(
    withoutPublisher("JCDecaux").map((p) => p.publisher_name),
  )
  assert.ok(extras.some((p) => p.publisher_name === "Nova Outdoor"))

  const loaded = await buildIngestReviewFromFile(
    JCD_FILE,
    [...withoutPublisher("JCDecaux"), confirmed.profile],
    { skipAva: true, pinnedPublisherName: "Nova Outdoor" },
  )
  assert.equal(loaded.proposed_profile, undefined)
  assert.ok((loaded.proposal?.line_items.length ?? 0) > 0)
  const form = ingestReviewToFormLineItems(loaded)
  assert.ok(form.items.length > 0)
})
