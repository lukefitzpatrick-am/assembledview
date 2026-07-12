import assert from "node:assert/strict"
import test from "node:test"

import { parseMiExportPath } from "../parseMiExportPath.js"

test("parseMiExportPath accepts exports/mi/<mba>/<file>", () => {
  assert.deepEqual(parseMiExportPath("exports/mi/jayco001/Client_Campaign_MI.xlsx"), {
    pathname: "exports/mi/jayco001/Client_Campaign_MI.xlsx",
    mba: "jayco001",
  })
  assert.deepEqual(
    parseMiExportPath("/exports/mi/MBA123/file-abc123.xlsx"),
    {
      pathname: "exports/mi/MBA123/file-abc123.xlsx",
      mba: "MBA123",
    },
  )
  assert.deepEqual(
    parseMiExportPath(encodeURIComponent("exports/mi/foo/bar.xlsx")),
    {
      pathname: "exports/mi/foo/bar.xlsx",
      mba: "foo",
    },
  )
})

test("parseMiExportPath rejects traversal and non-MI paths", () => {
  assert.equal(parseMiExportPath("exports/other/mba/file.xlsx"), null)
  assert.equal(parseMiExportPath("exports/mi/../secret.xlsx"), null)
  assert.equal(parseMiExportPath("exports/mi/mba/../../etc/passwd"), null)
  assert.equal(parseMiExportPath("exports/mi/mba"), null)
  assert.equal(parseMiExportPath("exports/mi/"), null)
  assert.equal(parseMiExportPath(""), null)
  assert.equal(parseMiExportPath("exports/mi/mba/foo\\bar.xlsx"), null)
})
