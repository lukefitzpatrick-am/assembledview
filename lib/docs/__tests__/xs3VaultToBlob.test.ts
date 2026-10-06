import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  selectVaultWorkItems,
  shouldSkipBlobUrl,
  xs3BlobPathname,
  type Xs3VersionRow,
} from "../xs3VaultToBlob"

const VAULT = "https://xg4h-uyzs-dtex.a2.xano.io/vault/plan.xlsx"
const BLOB = "https://abc.private.blob.vercel-storage.com/plans/glenda008/v6/media_plan/plan.xlsx"

function row(partial: Partial<Xs3VersionRow> = {}): Xs3VersionRow {
  return {
    id: 42,
    versionNumber: 6,
    mbaNumber: "glenda008",
    mediaPlanFile: null,
    mbaPdfFile: null,
    aaMediaPlanFile: null,
    ...partial,
  }
}

function xanoFile(url: string, name: string) {
  return { url, meta: {}, mime: "application/pdf", name, path: "/vault/x", size: 10 }
}

describe("selectVaultWorkItems", () => {
  it("selects every column whose url contains xano.io", () => {
    const items = selectVaultWorkItems(
      row({
        mediaPlanFile: xanoFile(VAULT, "plan.xlsx"),
        mbaPdfFile: xanoFile(VAULT.replace("plan.xlsx", "mba.pdf"), "mba.pdf"),
        aaMediaPlanFile: xanoFile(VAULT.replace("plan.xlsx", "aa.xlsx"), "aa.xlsx"),
      }),
    )
    assert.deepEqual(
      items.map((item) => item.kind),
      ["media_plan", "mba_pdf", "aa_media_plan"],
    )
    assert.equal(items[0]?.versionId, 42)
    assert.equal(items[0]?.mbaNumber, "glenda008")
    assert.equal(items[0]?.name, "plan.xlsx")
  })

  it("limits the scan to --kind", () => {
    const items = selectVaultWorkItems(
      row({
        mediaPlanFile: xanoFile(VAULT, "plan.xlsx"),
        mbaPdfFile: xanoFile(VAULT, "mba.pdf"),
      }),
      ["mba_pdf"],
    )
    assert.deepEqual(
      items.map((item) => item.kind),
      ["mba_pdf"],
    )
  })

  it("does not select a column that is already on Blob", () => {
    const items = selectVaultWorkItems(
      row({
        mediaPlanFile: { url: BLOB, name: "plan.xlsx" },
        mbaPdfFile: xanoFile(VAULT, "mba.pdf"),
      }),
    )
    assert.deepEqual(
      items.map((item) => item.kind),
      ["mba_pdf"],
    )
  })
})

describe("xs3BlobPathname", () => {
  it("builds plans/{MBA}/v{n}/{kind}/{original name}", () => {
    assert.equal(
      xs3BlobPathname("glenda008", 6, "media_plan", "plan.xlsx"),
      "plans/glenda008/v6/media_plan/plan.xlsx",
    )
    assert.equal(
      xs3BlobPathname("glenda008", 6, "mba_pdf", "mba.pdf"),
      "plans/glenda008/v6/mba_pdf/mba.pdf",
    )
    assert.equal(
      xs3BlobPathname("glenda008", 6, "aa_media_plan", "aa.xlsx"),
      "plans/glenda008/v6/aa_media_plan/aa.xlsx",
    )
  })
})

describe("shouldSkipBlobUrl", () => {
  it("skips blob.vercel-storage.com and keeps a vault url", () => {
    assert.equal(shouldSkipBlobUrl(BLOB), true)
    assert.equal(shouldSkipBlobUrl("https://store.blob.vercel-storage.com/plans/a.pdf"), true)
    assert.equal(shouldSkipBlobUrl(VAULT), false)
  })
})
