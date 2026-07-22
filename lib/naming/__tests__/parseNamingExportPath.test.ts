import assert from "node:assert/strict"
import test from "node:test"

import { parseNamingExportPath } from "../parseNamingExportPath.js"

test("parseNamingExportPath accepts exports/naming/<mba>/<file>", () => {
  assert.deepEqual(parseNamingExportPath("exports/naming/jayco001/Client.xlsx"), {
    pathname: "exports/naming/jayco001/Client.xlsx",
    mba: "jayco001",
  })
  assert.deepEqual(
    parseNamingExportPath("/exports/naming/MBA123/file-abc123.xlsx"),
    {
      pathname: "exports/naming/MBA123/file-abc123.xlsx",
      mba: "MBA123",
    },
  )
})

test("parseNamingExportPath rejects traversal and wrong prefix", () => {
  assert.equal(parseNamingExportPath("exports/other/mba/file.xlsx"), null)
  assert.equal(parseNamingExportPath("exports/naming/../secret.xlsx"), null)
  assert.equal(parseNamingExportPath("exports/naming/mba/../../etc/passwd"), null)
  assert.equal(parseNamingExportPath("exports/naming/mba"), null)
  assert.equal(parseNamingExportPath("exports/naming/"), null)
  assert.equal(parseNamingExportPath("exports/naming/mba/foo\\bar.xlsx"), null)
})
