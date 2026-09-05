import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  backfillKindsNotYetMarked,
  backfillPlanDocumentsMarkerKey,
  countMissingByKind,
  parseBackfillPlanDocumentsArgs,
  planDocumentOutFilenames,
} from "@/lib/docs/backfillPlanDocumentsArgs"

describe("parseBackfillPlanDocumentsArgs", () => {
  it("parses --out, --mba, and --version for a historic published cut", () => {
    const parsed = parseBackfillPlanDocumentsArgs([
      "--out",
      "tmp/doc3/penfold001-v16",
      "--mba",
      "PENFOLD001",
      "--version",
      "16",
    ])
    assert.equal(parsed.outDir, "tmp/doc3/penfold001-v16")
    assert.equal(parsed.mba, "PENFOLD001")
    assert.equal(parsed.version, 16)
    assert.equal(parsed.apply, false)
    assert.equal(parsed.force, true)
  })

  it("accepts --out= and --version= forms; --apply with --out still never persist", () => {
    const parsed = parseBackfillPlanDocumentsArgs([
      "--apply",
      "--out=tmp/parity",
      "--mba=golf002",
      "--version=28",
    ])
    assert.equal(parsed.outDir, "tmp/parity")
    assert.equal(parsed.mba, "golf002")
    assert.equal(parsed.version, 28)
    assert.equal(parsed.apply, false)
  })

  it("keeps dry-run apply false when --out is absent", () => {
    const parsed = parseBackfillPlanDocumentsArgs(["--mba", "hema003"])
    assert.equal(parsed.outDir, null)
    assert.equal(parsed.mba, "hema003")
    assert.equal(parsed.version, null)
    assert.equal(parsed.apply, false)
    assert.equal(parsed.force, false)
    assert.deepEqual(parsed.kinds, ["mba_pdf", "media_plan", "aa_media_plan"])
  })

  it("parses --kinds as a comma list; default is all three", () => {
    assert.deepEqual(parseBackfillPlanDocumentsArgs([]).kinds, [
      "mba_pdf",
      "media_plan",
      "aa_media_plan",
    ])
    assert.deepEqual(
      parseBackfillPlanDocumentsArgs(["--kinds", "mba_pdf"]).kinds,
      ["mba_pdf"],
    )
    assert.deepEqual(
      parseBackfillPlanDocumentsArgs([
        "--kinds",
        "media_plan,aa_media_plan,mba_pdf",
      ]).kinds,
      ["media_plan", "aa_media_plan", "mba_pdf"],
    )
    assert.deepEqual(
      parseBackfillPlanDocumentsArgs(["--kinds=mba_pdf,mba_pdf"]).kinds,
      ["mba_pdf"],
    )
  })
})

describe("countMissingByKind", () => {
  it("counts missing file columns among the requested kinds only", () => {
    const rows = [
      { mba_pdf: null, media_plan: {}, aa_media_plan: null },
      { mba_pdf: {}, media_plan: null, aa_media_plan: null },
    ]
    const counts = countMissingByKind(rows, ["mba_pdf", "media_plan"])
    assert.equal(counts.mba_pdf, 1)
    assert.equal(counts.media_plan, 1)
    assert.equal(counts.aa_media_plan, 0)
  })
})

describe("backfillPlanDocumentsMarkerKey", () => {
  it("keys each kind under doc2_plan_documents_backfill so Excel cannot block MBA", () => {
    assert.equal(
      backfillPlanDocumentsMarkerKey("media_plan"),
      "doc2_plan_documents_backfill:media_plan",
    )
    assert.equal(
      backfillPlanDocumentsMarkerKey("aa_media_plan"),
      "doc2_plan_documents_backfill:aa_media_plan",
    )
    assert.equal(
      backfillPlanDocumentsMarkerKey("mba_pdf"),
      "doc2_plan_documents_backfill:mba_pdf",
    )
  })

  it("lets mba_pdf apply after an Excel-only marker set", () => {
    const remaining = backfillKindsNotYetMarked({
      kinds: ["mba_pdf"],
      markerKeys: [
        "doc2_plan_documents_backfill:media_plan",
        "doc2_plan_documents_backfill:aa_media_plan",
      ],
      force: false,
    })
    assert.deepEqual(remaining, ["mba_pdf"])
  })

  it("refuses kinds already marked unless --force", () => {
    assert.deepEqual(
      backfillKindsNotYetMarked({
        kinds: ["media_plan", "aa_media_plan"],
        markerKeys: ["doc2_plan_documents_backfill:media_plan"],
        force: false,
      }),
      ["aa_media_plan"],
    )
    assert.deepEqual(
      backfillKindsNotYetMarked({
        kinds: ["mba_pdf"],
        markerKeys: ["doc2_plan_documents_backfill:mba_pdf"],
        force: false,
      }),
      [],
    )
    assert.deepEqual(
      backfillKindsNotYetMarked({
        kinds: ["mba_pdf"],
        markerKeys: ["doc2_plan_documents_backfill:mba_pdf"],
        force: true,
      }),
      ["mba_pdf"],
    )
  })

  it("treats the unsuffixed legacy marker as blocking every kind", () => {
    assert.deepEqual(
      backfillKindsNotYetMarked({
        kinds: ["mba_pdf", "media_plan"],
        markerKeys: ["doc2_plan_documents_backfill"],
        force: false,
      }),
      [],
    )
  })
})

describe("planDocumentOutFilenames", () => {
  it("names the three files by kind beside --out", () => {
    const names = planDocumentOutFilenames("PENFOLD001", 16)
    assert.equal(names.mba_pdf, "PENFOLD001-v16-mba_pdf.pdf")
    assert.equal(names.media_plan, "PENFOLD001-v16-media_plan.xlsx")
    assert.equal(names.aa_media_plan, "PENFOLD001-v16-aa_media_plan.xlsx")
  })
})
