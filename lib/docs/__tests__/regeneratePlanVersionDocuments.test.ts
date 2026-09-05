import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { parseRegenerateKinds } from "../planVersionFiles"
import { planDocumentBlobJson } from "../planDocumentBlob"

describe("parseRegenerateKinds", () => {
  it("defaults to all three kinds", () => {
    assert.deepEqual(parseRegenerateKinds(undefined), [
      "mba_pdf",
      "media_plan",
      "aa_media_plan",
    ])
    assert.deepEqual(parseRegenerateKinds([]), [
      "mba_pdf",
      "media_plan",
      "aa_media_plan",
    ])
  })

  it("keeps unique valid kinds in request order", () => {
    assert.deepEqual(parseRegenerateKinds(["aa_media_plan", "mba_pdf", "mba_pdf"]), [
      "aa_media_plan",
      "mba_pdf",
    ])
  })
})

describe("planDocumentBlobJson regenerated source", () => {
  it("stores source regenerated and generatedFrom persisted", () => {
    const json = planDocumentBlobJson({
      url: "https://abc.blob.vercel-storage.com/plans/glenda008/v6/mba_pdf/MBA.pdf",
      pathname: "plans/glenda008/v6/mba_pdf/MBA.pdf",
      name: "MBA.pdf",
      size: 10,
      mime: "application/pdf",
      uploadedAt: "2026-09-05T12:00:00.000Z",
      source: "regenerated",
      generatedFrom: "persisted",
    })
    assert.equal(json.source, "regenerated")
    assert.equal(json.generatedFrom, "persisted")
  })
})
