import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  planDocumentBlobJson,
  planDocumentBlobPathname,
} from "../planDocumentBlob"

describe("planDocumentBlobPathname", () => {
  it("writes plans/{mba}/v{n}/{kind}/{filename}", () => {
    assert.equal(
      planDocumentBlobPathname("glenda008", 6, "mba_pdf", "Glendale_MBA_v6.pdf"),
      "plans/glenda008/v6/mba_pdf/Glendale_MBA_v6.pdf",
    )
    assert.equal(
      planDocumentBlobPathname("glenda008", 6, "media_plan", "Glendale_MediaPlan_v6.xlsx"),
      "plans/glenda008/v6/media_plan/Glendale_MediaPlan_v6.xlsx",
    )
    assert.equal(
      planDocumentBlobPathname("glenda008", 6, "aa_media_plan", "Glendale_AA_v6.xlsx"),
      "plans/glenda008/v6/aa_media_plan/Glendale_AA_v6.xlsx",
    )
  })

  it("strips directory components from the filename", () => {
    assert.equal(
      planDocumentBlobPathname("glenda008", 1, "mba_pdf", "..\\etc\\passwd.pdf"),
      "plans/glenda008/v1/mba_pdf/passwd.pdf",
    )
  })
})

describe("planDocumentBlobJson", () => {
  it("stores url, pathname, name, size, mime, uploadedAt, source vercel-blob", () => {
    const json = planDocumentBlobJson({
      url: "https://abc.blob.vercel-storage.com/plans/glenda008/v6/mba_pdf/Glendale_MBA_v6.pdf",
      pathname: "plans/glenda008/v6/mba_pdf/Glendale_MBA_v6.pdf",
      name: "Glendale_MBA_v6.pdf",
      size: 1200,
      mime: "application/pdf",
      uploadedAt: "2026-09-05T12:00:00.000Z",
    })
    assert.deepEqual(json, {
      url: "https://abc.blob.vercel-storage.com/plans/glenda008/v6/mba_pdf/Glendale_MBA_v6.pdf",
      pathname: "plans/glenda008/v6/mba_pdf/Glendale_MBA_v6.pdf",
      name: "Glendale_MBA_v6.pdf",
      size: 1200,
      mime: "application/pdf",
      uploadedAt: "2026-09-05T12:00:00.000Z",
      source: "vercel-blob",
    })
  })
})
