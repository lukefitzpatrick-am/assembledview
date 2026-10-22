import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  backfillKindsNotYetMarked,
  backfillPlanDocumentsMarkerKey,
  countMissingByKind,
  parseBackfillPlanDocumentsArgs,
  planDocumentOutFilenames,
  staleRequestedKinds,
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

  it("defaults refreshBefore to null", () => {
    assert.equal(parseBackfillPlanDocumentsArgs([]).refreshBefore, null)
  })

  it("parses --refresh-before and --refresh-before= to a normalised ISO string", () => {
    const parsed = parseBackfillPlanDocumentsArgs([
      "--refresh-before",
      "2026-10-19T04:30:00Z",
      "--kinds",
      "aa_media_plan",
    ])
    assert.equal(parsed.refreshBefore, "2026-10-19T04:30:00.000Z")
    assert.deepEqual(parsed.kinds, ["aa_media_plan"])
    assert.equal(parsed.apply, false)
    assert.equal(parsed.outDir, null)
    assert.equal(
      parseBackfillPlanDocumentsArgs(["--refresh-before=2026-10-19T14:30:00+10:00"])
        .refreshBefore,
      "2026-10-19T04:30:00.000Z",
    )
  })

  it("rejects an invalid or missing --refresh-before value", () => {
    assert.throws(
      () => parseBackfillPlanDocumentsArgs(["--refresh-before", "yesterday"]),
      /--refresh-before needs an ISO date\/time/,
    )
    assert.throws(
      () => parseBackfillPlanDocumentsArgs(["--refresh-before", "2026-13-45T99:00:00Z"]),
      /--refresh-before needs an ISO date\/time/,
    )
    assert.throws(
      () => parseBackfillPlanDocumentsArgs(["--refresh-before"]),
      /--refresh-before needs an ISO date\/time/,
    )
  })

  it("rejects --refresh-before combined with --out", () => {
    assert.throws(
      () =>
        parseBackfillPlanDocumentsArgs([
          "--refresh-before",
          "2026-10-19T04:30:00Z",
          "--out",
          "tmp/x",
          "--mba",
          "PENFOLD020",
          "--version",
          "29",
        ]),
      /--refresh-before cannot be combined with --out/,
    )
  })
})

describe("staleRequestedKinds", () => {
  const cutoff = "2026-10-19T04:30:00.000Z"

  it("selects only requested kinds whose uploadedAt is before the cutoff", () => {
    const files = {
      mba_pdf: { url: "https://x", uploadedAt: "2026-10-01T00:00:00.000Z" },
      media_plan: { url: "https://x", uploadedAt: "2026-10-20T00:00:00.000Z" },
      aa_media_plan: { url: "https://x", uploadedAt: "2026-10-19T04:29:59.000Z" },
    }
    assert.deepEqual(
      staleRequestedKinds(files, ["mba_pdf", "media_plan", "aa_media_plan"], cutoff),
      ["mba_pdf", "aa_media_plan"],
    )
    assert.deepEqual(staleRequestedKinds(files, ["aa_media_plan"], cutoff), ["aa_media_plan"])
    assert.deepEqual(staleRequestedKinds(files, ["media_plan"], cutoff), [])
  })

  it("never selects missing files, legacy files without uploadedAt, or unparseable values", () => {
    const files = {
      mba_pdf: null,
      media_plan: { path: "https://xano/vault/x.xlsx", name: "x.xlsx" },
      aa_media_plan: { url: "https://x", uploadedAt: "not a date" },
    }
    assert.deepEqual(
      staleRequestedKinds(files, ["mba_pdf", "media_plan", "aa_media_plan"], cutoff),
      [],
    )
  })

  it("treats uploadedAt equal to the cutoff as fresh", () => {
    const files = {
      mba_pdf: null,
      media_plan: null,
      aa_media_plan: { url: "https://x", uploadedAt: cutoff },
    }
    assert.deepEqual(staleRequestedKinds(files, ["aa_media_plan"], cutoff), [])
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
