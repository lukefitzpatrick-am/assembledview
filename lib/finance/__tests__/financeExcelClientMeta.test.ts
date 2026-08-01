import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  clientApiRowToFinanceExcelMeta,
  enrichFinanceExcelClientMetaFromApiRow,
} from "@/lib/finance/excelFinanceExport"

describe("finance Excel client meta", () => {
  it("parses legalbusinessname and abn from API row", () => {
    assert.deepEqual(
      clientApiRowToFinanceExcelMeta({
        legalbusinessname: " Acme Pty Ltd ",
        abn: "12 345 678 901",
      }),
      { legalBusinessName: "Acme Pty Ltd", abn: "12 345 678 901" }
    )
  })

  it("falls back to display name when legalbusinessname is empty", () => {
    const enriched = enrichFinanceExcelClientMetaFromApiRow({
      id: 7,
      mp_client_name: "Acme Display",
      legalbusinessname: "  ",
      abn: "998877",
    })
    assert.equal(enriched.clientId, 7)
    assert.equal(enriched.legalNameMissing, true)
    assert.equal(enriched.displayName, "Acme Display")
    assert.deepEqual(enriched.meta, {
      legalBusinessName: "Acme Display",
      abn: "998877",
    })
  })

  it("keeps legal name when present", () => {
    const enriched = enrichFinanceExcelClientMetaFromApiRow({
      id: 3,
      mp_client_name: "Short",
      legalbusinessname: "Short Legal Pty Ltd",
      abn: "",
    })
    assert.equal(enriched.legalNameMissing, false)
    assert.equal(enriched.meta.legalBusinessName, "Short Legal Pty Ltd")
    assert.equal(enriched.meta.abn, "")
  })
})
