import assert from "node:assert/strict"
import test from "node:test"
import { jsPDF } from "jspdf"

import { applyBrandFonts } from "../brandPdf"

test("applyBrandFonts registers Plus Jakarta Sans normal, bold and extrabold", async () => {
  const doc = new jsPDF()
  await applyBrandFonts(doc)
  const list = doc.getFontList()
  const styles = list.PlusJakartaSans
  assert.ok(styles)
  assert.deepEqual([...styles].sort(), ["bold", "extrabold", "normal"])
  assert.equal(doc.getFont().fontName, "PlusJakartaSans")
})
