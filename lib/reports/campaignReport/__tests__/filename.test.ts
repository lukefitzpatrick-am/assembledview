import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { campaignReportFilename } from "@/lib/reports/campaignReport/filename"

describe("campaignReportFilename", () => {
  it("matches campaign-report-{mba}-{period}-{yyyymmdd}.pptx", () => {
    assert.equal(
      campaignReportFilename({
        mbaNumber: "PENFOLD013",
        periodSlug: "this-month",
        yyyymmdd: "20260802",
      }),
      "campaign-report-PENFOLD013-this-month-20260802.pptx",
    )
  })
})
