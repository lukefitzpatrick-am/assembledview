import assert from "node:assert/strict"
import test from "node:test"

import { parseReportExportPath } from "../parseReportExportPath.js"

test("parseReportExportPath accepts exports/reports/<mba>/<file>", () => {
  assert.deepEqual(
    parseReportExportPath("exports/reports/jayco001/Client_performance_report.pptx"),
    {
      pathname: "exports/reports/jayco001/Client_performance_report.pptx",
      mba: "jayco001",
    },
  )
  assert.deepEqual(parseReportExportPath("/exports/reports/MBA123/file-abc123.pptx"), {
    pathname: "exports/reports/MBA123/file-abc123.pptx",
    mba: "MBA123",
  })
  assert.deepEqual(
    parseReportExportPath(encodeURIComponent("exports/reports/foo/bar.pptx")),
    {
      pathname: "exports/reports/foo/bar.pptx",
      mba: "foo",
    },
  )
})

test("parseReportExportPath rejects traversal and non-report paths", () => {
  assert.equal(parseReportExportPath("exports/mi/mba/file.pptx"), null)
  assert.equal(parseReportExportPath("exports/other/mba/file.pptx"), null)
  assert.equal(parseReportExportPath("exports/reports/../secret.pptx"), null)
  assert.equal(parseReportExportPath("exports/reports/mba/../../etc/passwd"), null)
  assert.equal(parseReportExportPath("exports/reports/mba"), null)
  assert.equal(parseReportExportPath("exports/reports/"), null)
  assert.equal(parseReportExportPath(""), null)
  assert.equal(parseReportExportPath("exports/reports/mba/foo\\bar.pptx"), null)
})
