import assert from "node:assert/strict"
import test from "node:test"

import {
  buildMiWorkbook,
  miPayloadFromResolve,
  miWorkbookFilename,
} from "../buildMiWorkbook"
import { applyClientPrefill } from "../applyClientPrefill"
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
      id: "specs_source:direct-1",
      appliesTo: "specs_source:direct-1",
      field: "specs_source",
      question: "No specs in the library for this row — do you have the publisher's spec sheet?",
      type: "choice",
      options: ["upload document", "paste text", "per booking", "skip"],
      rowRef: { line_item_id: "direct-1", displayName: "News Corp — Sponsored article" },
    }],
    derived: [],
    summary: { resolved: 1, open: 1 },
  }

  const input = miPayloadFromResolve(
    { name: "Winter Launch", client: "Acme" },
    result,
  )
  const { workbook, gapCount, sheetNames } = await buildMiWorkbook(input)

  assert.deepEqual(sheetNames, ["Cover", "Social", "Direct Digital"])
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

test("golden: workbook writes RSA library SPECS into Search columns", async () => {
  const { resolveMiPlan } = await import("../resolve.js")
  const { loadMiLibrary } = await import("../library.js")
  const library = loadMiLibrary()
  const result = resolveMiPlan({
    lineItems: {
      search: [{
        id: "rsa-wb",
        publisher: "Google Ads",
        creative: "Responsive Search Ads (RSA)",
      }],
    },
  }, library)
  const { workbook } = await buildMiWorkbook(
    miPayloadFromResolve({ name: "Winter Launch", client: "Acme" }, result),
  )
  const sheet = workbook.getWorksheet("Search")
  assert.ok(sheet)
  const headers = sheet.getRow(2).values as Array<string | undefined>
  const col = (name: string) => headers.findIndex((header) => header === name)
  assert.equal(sheet.getCell(3, col("Headline Limits")).value, "Min 1, max 15. 30 characters each.")
  assert.match(String(sheet.getCell(3, col("Best Practice Notes")).value), /Pin Headline 1/)
  assert.match(String(sheet.getCell(3, col("Source")).value), /support\.google\.com/)
  assert.match(String(sheet.getCell(3, col("Line Item")).value), /Responsive Search Ads \(RSA\)/)
  assert.notEqual(sheet.getCell(3, col("Best Practice Notes")).value, "NEEDS_SPEC")
})

test("client_prefill merges AVA copy into Social CLIENT columns", async () => {
  const prefills = applyClientPrefill([socialRow], [
    {
      line_item_id: "social-1",
      variant: "A",
      fields: {
        "Image/Video File Name": "hero-feed.jpg",
        "Primary Text": "Hook line for the feed",
        Headline: "Winter sale on",
        Description: "Shop in-store",
        "Call To Action": "Shop Now",
        "Landing Page URL": "https://example.com/sale",
      },
    },
    {
      line_item_id: "social-1",
      variant: "B",
      fields: {
        "Image/Video File Name": "hero-feed.jpg",
        "Primary Text": "Second angle caption",
        Headline: "Don't miss it",
        "Call To Action": "Learn More",
        "Landing Page URL": "https://example.com/sale",
      },
    },
  ])

  assert.equal(prefills.length, 2)
  assert.equal(prefills[0].fields_client["Primary Text"], "Hook line for the feed")
  assert.equal(prefills[0].fields_client.Headline, "Winter sale on")
  assert.equal(prefills[0].fields_client["Call To Action"], "Shop Now")
  assert.equal(prefills[0].variant, "A")
  assert.equal(prefills[1].fields_client["Primary Text"], "Second angle caption")
  assert.equal(prefills[1].variant, "B")

  const { workbook } = await buildMiWorkbook(
    miPayloadFromResolve({ name: "Winter Launch", client: "Acme" }, {
      resolved: prefills,
      open_questions: [],
      derived: [],
      summary: { resolved: 2, open: 0 },
    }),
  )
  const sheet = workbook.getWorksheet("Social")
  assert.ok(sheet)
  const headers = sheet.getRow(2).values as Array<string | undefined>
  const col = (name: string) => headers.findIndex((header) => header === name)
  assert.equal(sheet.getCell(3, col("Primary Text")).value, "Hook line for the feed")
  assert.equal(sheet.getCell(3, col("Headline")).value, "Winter sale on")
  assert.equal(sheet.getCell(3, col("Call To Action")).value, "Shop Now")
  assert.equal(sheet.getCell(3, col("Landing Page URL")).value, "https://example.com/sale")
  assert.equal(sheet.getCell(3, col("Variant")).value, "A")
  assert.equal(sheet.getCell(4, col("Primary Text")).value, "Second angle caption")
  assert.equal(sheet.getCell(4, col("Variant")).value, "B")
})

test("golden: specs_source paste text lands in Publisher-Specific Notes", async () => {
  const { resolveMiPlan } = await import("../resolve.js")
  const { loadMiLibrary } = await import("../library.js")
  const library = loadMiLibrary()
  const plan = {
    lineItems: {
      digitalAudio: [{
        id: "paste-wb",
        publisher: "Quantcast",
        placement: "Sponsored podcast",
      }],
    },
  }
  const result = resolveMiPlan(plan, library, [
    { questionId: "specs_source:paste-wb", answer: "paste text" },
    { questionId: "specs_paste:paste-wb", answer: "WAV only; 5 business days prior" },
  ])
  assert.equal(result.open_questions.length, 0)
  assert.equal(result.resolved[0]?.confidence, "needs_spec")
  assert.equal(result.resolved[0]?.format_name, "NEEDS_SPEC")

  const { workbook, gapCount } = await buildMiWorkbook(
    miPayloadFromResolve({ name: "Winter Launch", client: "Acme" }, result),
  )
  const sheet = workbook.getWorksheet("Direct Digital")
  assert.ok(sheet)
  const headers = sheet.getRow(2).values as Array<string | undefined>
  const col = (name: string) => headers.findIndex((header) => header === name)
  assert.equal(
    sheet.getCell(3, col("Publisher-Specific Notes")).value,
    "WAV only; 5 business days prior",
  )
  assert.equal(sheet.getCell(3, col("Format")).value, "NEEDS_SPEC")
  assert.ok(gapCount >= 1)
})
test("golden: specs_source per-booking and skip leave clean NEEDS_SPEC gaps", async () => {
  const { resolveMiPlan } = await import("../resolve.js")
  const { loadMiLibrary } = await import("../library.js")
  const library = loadMiLibrary()

  for (const answer of ["per booking", "skip"] as const) {
    const id = answer === "skip" ? "skip-wb" : "per-wb"
    const result = resolveMiPlan({
      lineItems: {
        digitalAudio: [{
          id,
          publisher: "Quantcast",
          placement: "Sponsored podcast",
        }],
      },
    }, library, [
      { questionId: `specs_source:${id}`, answer },
    ])
    assert.equal(result.open_questions.length, 0)
    assert.equal(result.resolved[0]?.confidence, "needs_spec")
    assert.equal(result.resolved[0]?.format_name, "NEEDS_SPEC")
    assert.equal(
      result.resolved[0]?.fields_specs["Publisher-Specific Notes"],
      "Custom publisher format",
    )

    const { workbook, gapCount } = await buildMiWorkbook(
      miPayloadFromResolve({ name: "Winter Launch", client: "Acme" }, result),
    )
    const sheet = workbook.getWorksheet("Direct Digital")
    assert.ok(sheet)
    const headers = sheet.getRow(2).values as Array<string | undefined>
    const col = (name: string) => headers.findIndex((header) => header === name)
    assert.equal(sheet.getCell(3, col("Format")).value, "NEEDS_SPEC")
    assert.equal(
      sheet.getCell(3, col("Publisher-Specific Notes")).value,
      "Custom publisher format",
    )
    assert.equal(sheet.getCell(3, col("File Type")).value, "NEEDS_SPEC")
    assert.ok(gapCount >= 1)
  }
})
