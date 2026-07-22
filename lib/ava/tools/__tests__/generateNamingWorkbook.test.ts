import assert from "node:assert/strict"
import test from "node:test"

import { toChatFileAttachment } from "../../chatFileAttachment.js"
import {
  NAMING_WORKBOOK_SAVED_PLAN_CAVEAT,
  generateNamingWorkbookTool,
  globalsFromSavedNamingPlan,
} from "../generateNamingWorkbook.js"

test("generate_naming_workbook description states saved-vs-unsaved caveat", () => {
  const description = generateNamingWorkbookTool.definition.description ?? ""
  assert.match(description, /SAVED plan/i)
  assert.match(description, /unsaved/i)
  assert.match(description, /Generate Naming \(Ava\)/)
  assert.ok(description.includes(NAMING_WORKBOOK_SAVED_PLAN_CAVEAT))
})

test("generate_naming_workbook tool name + schema", () => {
  assert.equal(generateNamingWorkbookTool.definition.name, "generate_naming_workbook")
  const schema = generateNamingWorkbookTool.definition.input_schema as {
    properties?: Record<string, unknown>
  }
  assert.ok(schema.properties?.mba)
  assert.ok(schema.properties?.versionNumber)
})

test("globalsFromSavedNamingPlan prefers page entities then line fields", () => {
  const globals = globalsFromSavedNamingPlan(
    "MBA99",
    {
      digitalDisplay: [
        {
          line_item_id: "dd1",
          client_name: "Acme Co",
          brand: "Acme",
          campaign_name: "Summer",
          start_date: "2026-07-01",
        },
      ],
    },
    {
      entities: {
        clientName: "Acme Page",
        campaignName: "Page Campaign",
      },
    },
  )
  assert.equal(globals.mba, "mba99")
  assert.ok(globals.campaign.length > 0)
  assert.ok(globals.client.length > 0)
})

test("toChatFileAttachment builds naming download card shape", () => {
  const attachment = toChatFileAttachment({
    fileName: "naming-mba99-v1-20260722.xlsx",
    url: "/api/naming/exports/download?path=exports%2Fnaming%2Fmba99%2Ffile.xlsx",
    contentType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    sizeBytes: 4096,
  })
  assert.equal(attachment.kind, "file")
  assert.match(attachment.url, /\/api\/naming\/exports\/download/)
  assert.match(attachment.fileName, /\.xlsx$/)
})
