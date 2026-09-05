import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
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
