import assert from "node:assert/strict"
import test from "node:test"
import { MAX_UPLOAD_BYTES, validateUploadFile } from "../validateUploadFile.js"

test("validateUploadFile rejects missing file", () => {
  assert.equal(validateUploadFile(null), "Exactly one file is required")
})

test("validateUploadFile rejects empty file", () => {
  assert.equal(validateUploadFile({ name: "a.xlsx", size: 0 }), "File is empty")
})

test("validateUploadFile rejects non-xlsx extension", () => {
  assert.equal(validateUploadFile({ name: "a.csv", size: 10 }), "File must be .xlsx or .xlsm")
})

test("validateUploadFile rejects files over 10 MB", () => {
  assert.equal(
    validateUploadFile({ name: "a.xlsx", size: MAX_UPLOAD_BYTES + 1 }),
    "File must be 10 MB or smaller"
  )
})

test("validateUploadFile accepts .xlsx and .xlsm within the size cap", () => {
  assert.equal(validateUploadFile({ name: "a.xlsx", size: 12 }), null)
  assert.equal(validateUploadFile({ name: "b.XLSM", size: 12 }), null)
})
