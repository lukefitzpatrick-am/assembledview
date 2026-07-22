import assert from "node:assert/strict"
import test from "node:test"

import { filenameFromContentDisposition } from "../fetchNamingWorkbook.js"

test("filenameFromContentDisposition: quoted filename", () => {
  assert.equal(
    filenameFromContentDisposition('attachment; filename="naming-mba-20260101.xlsx"'),
    "naming-mba-20260101.xlsx",
  )
})

test("filenameFromContentDisposition: RFC5987 filename*", () => {
  assert.equal(
    filenameFromContentDisposition(
      "attachment; filename*=UTF-8''naming%20plan.xlsx",
    ),
    "naming plan.xlsx",
  )
})
