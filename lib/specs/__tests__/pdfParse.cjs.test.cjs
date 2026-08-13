"use strict"

const assert = require("node:assert/strict")
const { test } = require("node:test")
const pdfParse = require("../pdfParse.cjs")
const { buildHelloWorldPdf } = require("./buildHelloWorldPdf.cjs")

test("pdfParse.cjs reuses pdf-parse on a one-page PDF (CJS)", async () => {
  const extracted = await pdfParse(Uint8Array.from(buildHelloWorldPdf("Hello World")))
  assert.equal(extracted.numpages, 1)
  assert.match(extracted.text, /Hello World/i)
})
