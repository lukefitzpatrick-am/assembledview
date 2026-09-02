import assert from "node:assert/strict"
import path from "node:path"
import test from "node:test"

import { buildIngestReviewFromFile } from "../buildIngestReview"
import { loadSeedPublisherProfiles } from "../loadPublisherProfiles"
import { listOpenIngestReviewQuestions } from "../ingestReviewQuestions"
import { stampProposalForSave } from "../stampProposalForSave"
import { resolveControlledValue } from "../resolveControlledValue"
import {
  clearValueSynonymOverlayForTests,
  getValueSynonymOverlayForTests,
  learnSynonym,
} from "../valueSynonymRepo"

const QMS_ID = 30
const CREATED_BY = "luke@assembledmedia.com.au"

test("exact canonical and exact label both hit, via exact", async () => {
  clearValueSynonymOverlayForTests()
  const byValue = await resolveControlledValue({
    vocabularyKey: "ooh_format",
    raw: "large_format",
    publisherId: null,
  })
  assert.equal(byValue.canonical, "large_format")
  assert.equal(byValue.via, "exact")
  assert.equal(byValue.suggestion, null)

  const byLabel = await resolveControlledValue({
    vocabularyKey: "ooh_format",
    raw: "Large Format",
    publisherId: null,
  })
  assert.equal(byLabel.canonical, "large_format")
  assert.equal(byLabel.via, "exact")
  assert.equal(byLabel.suggestion, null)
})

test("JCDecaux DIGITAL LARGE FORMAT strips the publisher prefix", async () => {
  clearValueSynonymOverlayForTests()
  const hit = await resolveControlledValue({
    vocabularyKey: "ooh_format",
    raw: "JCDecaux DIGITAL LARGE FORMAT",
    publisherId: 35,
    publisherName: "JCDecaux",
  })
  assert.equal(hit.canonical, "large_format")
  assert.ok(hit.via === "prefix_strip" || hit.via === "fuzzy")
  assert.equal(hit.suggestion, null)
})

test("Digital with no synonym stays unresolved (the QMS case)", async () => {
  clearValueSynonymOverlayForTests()
  const hit = await resolveControlledValue({
    vocabularyKey: "ooh_format",
    raw: "Digital",
    publisherId: QMS_ID,
    publisherName: "QMS",
  })
  assert.equal(hit.canonical, null)
  assert.equal(hit.via, null)
  assert.equal(hit.suggestion, null)
})

test("publisher synonym for Digital auto-applies large_format", async () => {
  clearValueSynonymOverlayForTests()
  await learnSynonym({
    publisherId: QMS_ID,
    mediaType: "ooh",
    vocabulary: "ooh_format",
    avField: "format",
    rawValue: "digital",
    rawValueDisplay: "Digital",
    avCanonical: "large_format",
    createdBy: CREATED_BY,
  })
  const hit = await resolveControlledValue({
    vocabularyKey: "ooh_format",
    raw: "Digital",
    publisherId: QMS_ID,
    publisherName: "QMS",
  })
  assert.equal(hit.canonical, "large_format")
  assert.equal(hit.via, "publisher_synonym")
  assert.equal(hit.suggestion, null)
})

test("a global synonym for Digital is a suggestion, never auto-applied", async () => {
  clearValueSynonymOverlayForTests()
  await learnSynonym({
    publisherId: null,
    mediaType: "ooh",
    vocabulary: "ooh_format",
    avField: "format",
    rawValue: "digital",
    rawValueDisplay: "Digital",
    avCanonical: "large_format",
    createdBy: CREATED_BY,
  })
  const hit = await resolveControlledValue({
    vocabularyKey: "ooh_format",
    raw: "Digital",
    publisherId: QMS_ID,
    publisherName: "QMS",
  })
  assert.equal(hit.canonical, null)
  assert.equal(hit.via, "global_synonym")
  assert.equal(hit.suggestion, "large_format")
})

test("re-answering a different canonical retires the old row", async () => {
  clearValueSynonymOverlayForTests()
  await learnSynonym({
    publisherId: 99901,
    mediaType: "ooh",
    vocabulary: "ooh_format",
    avField: "format",
    rawValue: "digital",
    rawValueDisplay: "Digital",
    avCanonical: "large_format",
    createdBy: CREATED_BY,
  })
  await learnSynonym({
    publisherId: 99901,
    mediaType: "ooh",
    vocabulary: "ooh_format",
    avField: "format",
    rawValue: "digital",
    rawValueDisplay: "Digital",
    avCanonical: "small_format",
    createdBy: CREATED_BY,
  })
  const rows = getValueSynonymOverlayForTests().filter(
    (row) => row.publisherId === 99901 && row.rawValue === "digital",
  )
  const retired = rows.filter((row) => !row.isActive)
  const active = rows.filter((row) => row.isActive)
  assert.equal(retired.length, 1)
  assert.equal(retired[0]!.avCanonical, "large_format")
  assert.ok(retired[0]!.retiredAt)
  assert.equal(retired[0]!.retiredBy, CREATED_BY)
  assert.equal(active.length, 1)
  assert.equal(active[0]!.avCanonical, "small_format")
  assert.equal(active[0]!.isActive, true)
})

test("learned QMS Digital does not return on re-upload and stamps the canonical", async () => {
  clearValueSynonymOverlayForTests()
  await learnSynonym({
    publisherId: QMS_ID,
    mediaType: "ooh",
    vocabulary: "ooh_format",
    avField: "format",
    rawValue: "digital",
    rawValueDisplay: "Digital",
    avCanonical: "large_format",
    createdBy: CREATED_BY,
  })
  const review = await buildIngestReviewFromFile(
    path.join(process.cwd(), "tests/fixtures/ava-plans/qms_strength-meals_esb-ooh.xlsx"),
    loadSeedPublisherProfiles(),
    { skipAva: true },
  )
  const digital = (review.template_coverage?.unresolved_controlled ?? []).filter(
    (item) => /digital/i.test(item.raw),
  )
  assert.equal(digital.length, 0)
  const questions = listOpenIngestReviewQuestions(review, {
    mbaNumber: "qms001",
    mbaNumbers: ["qms001"],
  })
  assert.equal(
    questions.some((q) => /Digital/i.test(q.text) && q.id.startsWith("ingest:value:")),
    false,
  )
  assert.ok(review.proposal)
  const stamped = stampProposalForSave(
    review.proposal!,
    "qms001",
    review.template_coverage?.resolved_controlled,
  )
  const formats = stamped.lineItems.map((line) => String(line.attrs?.format ?? ""))
  assert.ok(formats.includes("large_format"))
})
