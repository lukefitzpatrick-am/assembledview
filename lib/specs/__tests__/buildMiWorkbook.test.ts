import assert from "node:assert/strict"
import test from "node:test"

import {
  buildMiWorkbook,
  miPayloadFromResolve,
  miWorkbookFilename,
} from "../buildMiWorkbook"
import type { MiResolveResult, MiResolvedSpec } from "../resolve"

const socialRow: MiResolvedSpec = {
  line_item_id: "social-1",
  displayName: "Meta — Feed",
  container_category: "Social",
  publisher_slug: "meta",
  format_name: "Feed image",
  confidence: "high",
  fields_am: {
    Campaign: "Winter Launch",
    "Line Item": "Social prospecting",
    Publisher: "Meta",
    Format: "Feed image",
  },
  fields_specs: { "File Type": "JPG", Source: "Meta specs" },
  fields_client: { "Image/Video File Name": "winter-feed.jpg" },
}

test("builds tabs only for rows and materialises unanswered gaps", async () => {
  const result: MiResolveResult = {
    resolved: [socialRow],
    open_questions: [{
      id: "custom_specs:direct-1",
      appliesTo: "custom_specs:direct-1",
      field: "custom_specs",
      question: "Paste the publisher specs.",
      type: "text",
      rowRef: { line_item_id: "direct-1", displayName: "News Corp — Sponsored article" },
    }],
    summary: { resolved: 1, open: 1 },
  }

  const input = miPayloadFromResolve(
    { name: "Winter Launch", client: "Acme" },
    result,
  )
  const { workbook, gapCount, sheetNames } = await buildMiWorkbook(input)

  assert.deepEqual(sheetNames, ["Meta", "Social", "Direct Digital"])
  assert.equal(workbook.getWorksheet("Programmatic"), undefined)
  assert.ok(gapCount > 0)

  const direct = workbook.getWorksheet("Direct Digital")
  assert.ok(direct)
  const headers = direct.getRow(2).values as string[]
  const specsColumn = headers.findIndex((header) => header === "Publisher-Specific Notes")
  assert.ok(specsColumn > 0)
  assert.equal(direct.getCell(3, specsColumn).value, "NEEDS_SPEC")
})

test("formats a slug-safe material instructions filename", () => {
  assert.equal(
    miWorkbookFilename("Acme & Co.", "Winter / Launch", new Date("2026-07-11T00:00:00Z")),
    "MI_acme-co_winter-launch_20260711.xlsx",
  )
})
