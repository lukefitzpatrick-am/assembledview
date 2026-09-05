import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  buildPublishedDocumentsPayload,
  fileJsonForKind,
  parsePlanFileJson,
  unpublishedDocumentsPayload,
} from "../planVersionFiles"

const PUBLISHED_AT = "2026-09-05T04:00:00.000Z"

const xanoPdf = {
  access: "public",
  path: "https://a2.xano.io/vault/mba.pdf",
  name: "Glendale_MBA_v6.pdf",
  type: "pdf",
  size: 1200,
  mime: "application/pdf",
  meta: {},
}

const xanoXlsx = {
  access: "public",
  path: "https://a2.xano.io/vault/media.xlsx",
  name: "Glendale_MediaPlan_v6.xlsx",
  type: "xlsx",
  size: 800,
  mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  meta: {},
}

const vercelBlobPdf = {
  url: "https://abc.blob.vercel-storage.com/plans/glenda008/v6/mba_pdf/Glendale_MBA_v6.pdf",
  pathname: "plans/glenda008/v6/mba_pdf/Glendale_MBA_v6.pdf",
  name: "Glendale_MBA_v6.pdf",
  size: 1200,
  mime: "application/pdf",
  uploadedAt: "2026-09-05T12:00:00.000Z",
  source: "vercel-blob" as const,
}

describe("parsePlanFileJson", () => {
  it("treats an http(s) path as the url when url is absent (Xano vault jsonb)", () => {
    const parsed = parsePlanFileJson(xanoPdf, PUBLISHED_AT)
    assert.ok(parsed)
    assert.equal(parsed.url, "https://a2.xano.io/vault/mba.pdf")
    assert.equal(parsed.filename, "Glendale_MBA_v6.pdf")
    assert.equal(parsed.savedAt, PUBLISHED_AT)
  })

  it("prefers url over path when both exist", () => {
    const parsed = parsePlanFileJson(
      { url: "https://blob.vercel-storage.com/plans/mba.pdf", path: "/vault/old.pdf", name: "mba.pdf" },
      PUBLISHED_AT,
    )
    assert.ok(parsed)
    assert.equal(parsed.url, "https://blob.vercel-storage.com/plans/mba.pdf")
  })

  it("reads savedAt from uploadedAt when present", () => {
    const parsed = parsePlanFileJson(
      { ...xanoPdf, uploadedAt: "2026-09-01T00:00:00.000Z" },
      PUBLISHED_AT,
    )
    assert.ok(parsed)
    assert.equal(parsed.savedAt, "2026-09-01T00:00:00.000Z")
  })

  it("parses the Vercel Blob jsonb (url + uploadedAt; path optional)", () => {
    const parsed = parsePlanFileJson(vercelBlobPdf, PUBLISHED_AT)
    assert.ok(parsed)
    assert.equal(parsed.url, vercelBlobPdf.url)
    assert.equal(parsed.filename, vercelBlobPdf.name)
    assert.equal(parsed.savedAt, vercelBlobPdf.uploadedAt)
  })

  it("returns null when there is no url and path is not http(s)", () => {
    assert.equal(parsePlanFileJson({ name: "mba.pdf", path: "vault/mba.pdf" }, PUBLISHED_AT), null)
    assert.equal(parsePlanFileJson(null, PUBLISHED_AT), null)
    assert.equal(parsePlanFileJson({}, PUBLISHED_AT), null)
  })
})

describe("unpublishedDocumentsPayload", () => {
  it("returns null publishedVersionId and all files null", () => {
    assert.deepEqual(unpublishedDocumentsPayload(), {
      publishedVersionId: null,
      versionNumber: null,
      publishedAt: null,
      files: { mba_pdf: null, media_plan: null, aa_media_plan: null },
    })
  })
})

describe("buildPublishedDocumentsPayload", () => {
  it("keeps a missing third file null when two of three are saved", () => {
    const payload = buildPublishedDocumentsPayload({
      id: 42,
      versionNumber: 6,
      publishedAt: PUBLISHED_AT,
      mbaPdfFile: xanoPdf,
      mediaPlanFile: xanoXlsx,
      aaMediaPlanFile: null,
    })
    assert.equal(payload.publishedVersionId, 42)
    assert.equal(payload.versionNumber, 6)
    assert.equal(payload.publishedAt, PUBLISHED_AT)
    assert.ok(payload.files.mba_pdf)
    assert.equal(payload.files.mba_pdf.url, xanoPdf.path)
    assert.ok(payload.files.media_plan)
    assert.equal(payload.files.aa_media_plan, null)
  })
})

describe("fileJsonForKind", () => {
  it("selects aa_media_plan", () => {
    const aa = { url: "https://blob.vercel-storage.com/aa.xlsx", name: "AA.xlsx" }
    const file = fileJsonForKind("aa_media_plan", {
      mbaPdfFile: xanoPdf,
      mediaPlanFile: xanoXlsx,
      aaMediaPlanFile: aa,
    })
    assert.equal(file, aa)
  })
})
