import assert from "node:assert/strict"
import { createRequire } from "node:module"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"

import { buildSpecRunExtracted, extractSpecPdfText } from "../parsePdfText.js"

const requireFromHere = createRequire(import.meta.url)
const { buildHelloWorldPdf } = requireFromHere("./buildHelloWorldPdf.cjs") as {
  buildHelloWorldPdf: (text: string) => Buffer
}

test("extractSpecPdfText rejects empty buffers", async () => {
  await assert.rejects(() => extractSpecPdfText(Buffer.alloc(0)), /empty/i)
})

test("buildSpecRunExtracted stamps pdf-parse as the parser", () => {
  assert.deepEqual(buildSpecRunExtracted({ text: "5 working days before live", numpages: 1 }), {
    text: "5 working days before live",
    numpages: 1,
    parser: "pdf-parse",
  })
})

test("extractSpecPdfText loads pdf-parse through the CJS wrapper", () => {
  const src = fs.readFileSync(path.resolve("lib/specs/parsePdfText.ts"), "utf8")
  const wrapper = fs.readFileSync(path.resolve("lib/specs/pdfParse.cjs"), "utf8")
  assert.match(src, /pdfParse\.cjs/)
  assert.match(wrapper, /require\("pdf-parse"\)/)
})

test("extractSpecPdfText reuses pdf-parse on a one-page PDF", async () => {
  const extracted = await extractSpecPdfText(buildHelloWorldPdf("Hello World"))
  assert.equal(extracted.numpages, 1)
  assert.match(extracted.text, /Hello World/i)
})
