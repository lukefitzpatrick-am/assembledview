import assert from "node:assert/strict"
import test from "node:test"

import { composeName } from "../compose.js"
import {
  INVALID_NAME_CELL,
  PLATFORM_SHEET_NAMES,
  buildTraffickingWorkbook,
  formatLevelCopy,
  formatPlatformBlock,
  traffickingWorkbookFilename,
  tryComposeName,
} from "../exportTraffickingWorkbook.js"
import { getTemplate } from "../templates.js"
import type { NamingTemplate } from "../types.js"

function mustGet(platform: string, level: string): NamingTemplate {
  const t = getTemplate(platform, level)
  assert.ok(t, `missing template ${platform}/${level}`)
  return t
}

test("traffickingWorkbookFilename uses mba + yyyymmdd", () => {
  const name = traffickingWorkbookFilename("jayco001", new Date(Date.UTC(2026, 6, 11)))
  assert.equal(name, "naming-jayco001-20260711.xlsx")
})

test("formatLevelCopy joins valid names with newlines", () => {
  assert.equal(formatLevelCopy(["a", "b", "c"]), "a\nb\nc")
})

test("formatPlatformBlock emits level-headed plaintext", () => {
  const text = formatPlatformBlock([
    { level: "campaign", names: ["camp-a"] },
    { level: "ad_set", names: ["set-a", "set-b"] },
  ])
  assert.equal(
    text,
    "## Campaign\ncamp-a\n\n## Ad set\nset-a\nset-b",
  )
})

test("tryComposeName matches composeName for valid values", () => {
  const t = mustGet("meta", "campaign")
  const values = {
    platform_code: "fbig",
    client: "jayco",
    campaign: "jayco001",
    timing: "fy26q1",
    objective: "traffic",
  }
  const result = tryComposeName(t, values)
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.name, composeName(t, values))
  }
})

test("tryComposeName fails on missing required element", () => {
  const t = mustGet("meta", "ad_set")
  const result = tryComposeName(t, {
    campaign_name: "fbig-jayco-jayco001-fy26q1-traffic",
    geo: "nsw",
    targeting: "",
    line_item_id: "jayco001sm1",
  })
  assert.equal(result.ok, false)
})

test("buildTraffickingWorkbook: Input + platform + Rules sheets; invalid cell marker", async () => {
  const campaignTpl = mustGet("meta", "campaign")
  const adSetTpl = mustGet("meta", "ad_set")
  const campaignValues = {
    platform_code: "fbig",
    client: "jayco",
    campaign: "jayco001",
    timing: "fy26q1",
    objective: "traffic",
  }
  const campaignName = composeName(campaignTpl, campaignValues)

  const workbook = await buildTraffickingWorkbook({
    globals: {
      brand: "jayco",
      client: "jayco",
      campaign: "jayco001",
      mba: "jayco001",
      month_start: "jan26",
      campaign_start_date: "2026-01-01",
    },
    inputRows: [
      {
        channelKey: "socialMedia",
        channelLabel: "Social",
        publisher: "meta",
        media_type: "social",
        line_item_id: "jayco001sm1",
        buy_type: "",
        targeting: "prospecting",
      },
    ],
    platforms: [
      {
        platform: "meta",
        levels: [
          {
            template: campaignTpl,
            rows: [{ values: campaignValues }],
          },
          {
            template: adSetTpl,
            rows: [
              {
                values: {
                  campaign_name: campaignName,
                  geo: "nsw",
                  targeting: "prospecting",
                  line_item_id: "jayco001sm1",
                },
              },
              {
                values: {
                  campaign_name: campaignName,
                  geo: "nsw",
                  targeting: "",
                  line_item_id: "jayco001sm1",
                },
              },
            ],
          },
        ],
      },
    ],
  })

  assert.equal(workbook.worksheets[0]?.name, "Input sheet")
  assert.ok(workbook.getWorksheet(PLATFORM_SHEET_NAMES.meta))
  assert.ok(workbook.getWorksheet("Rules"))

  const input = workbook.getWorksheet("Input sheet")!
  assert.equal(input.getCell(1, 1).value, "brand")
  assert.equal(input.getCell(1, 2).value, "jayco")
  assert.equal(input.getCell(2, 1).value, "campaign")
  assert.equal(input.getCell(3, 1).value, "mba")
  assert.equal(input.getCell(4, 1).value, "month_start")
  assert.equal(input.getCell(4, 2).value, "jan26")

  const social = workbook.getWorksheet(PLATFORM_SHEET_NAMES.meta)!
  const composedCol = adSetTpl.elements.length + 1
  // Find the invalid ad_set row's composed name cell
  let foundInvalid = false
  let foundValid = false
  social.eachRow((row) => {
    const last = row.getCell(composedCol).value
    if (last === INVALID_NAME_CELL) foundInvalid = true
    if (typeof last === "string" && last.includes("jayco001sm1") && last !== INVALID_NAME_CELL) {
      foundValid = true
      assert.equal(last, composeName(adSetTpl, {
        campaign_name: campaignName,
        geo: "nsw",
        targeting: "prospecting",
        line_item_id: "jayco001sm1",
      }))
    }
  })
  assert.equal(foundValid, true, "expected a valid composed ad_set name")
  assert.equal(foundInvalid, true, "expected INVALID marker for broken row")

  const rules = workbook.getWorksheet("Rules")!
  const rulesText = JSON.stringify(
    rules.getSheetValues().map((r) => (Array.isArray(r) ? r.join("|") : r)),
  )
  assert.match(rulesText, /DV360/i)
  assert.match(rulesText, /programmatic/i)
  assert.match(rulesText, /line_item_id/i)
  assert.match(rulesText, /pacing/i)
})
