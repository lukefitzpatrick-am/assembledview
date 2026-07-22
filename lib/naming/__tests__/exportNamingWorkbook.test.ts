import assert from "node:assert/strict"
import test from "node:test"

import type { BestPractice } from "@/lib/types/bestPractice"
import type { MediaContainerBestPractice, Publisher } from "@/lib/types/publisher"

import { composeName } from "../compose.js"
import { evaluateNamingFormula } from "../formula.js"
import {
  INPUT_COLUMNS,
  INPUT_GLOBAL_CELLS,
  INPUT_TABLE_DATA_START_ROW,
  INPUT_TABLE_HEADER_ROW,
  INVALID_NAME_CELL,
  buildNamingWorkbook,
  namingWorkbookFilename,
} from "../exportNamingWorkbook.js"
import { getTemplate, PICKLISTS } from "../templates.js"

function item(
  overrides: Record<string, unknown>,
): Record<string, unknown> {
  return { ...overrides }
}

function formulaEquals(value: unknown): value is { formula: string; result: string } {
  return (
    !!value &&
    typeof value === "object" &&
    "formula" in value &&
    "result" in value &&
    typeof (value as { formula: unknown }).formula === "string"
  )
}

function cellMapFromSheet(
  sheet: { eachRow: (cb: (row: { number: number; getCell: (c: number) => { value: unknown } }, rowNumber: number) => void) => void },
  sheetNameForRefs?: string,
): Record<string, string> {
  const cells: Record<string, string> = {}
  sheet.eachRow((row, rowNumber) => {
    for (let c = 1; c <= 40; c++) {
      const v = row.getCell(c).value
      if (v === null || v === undefined) continue
      const letter = String.fromCharCode(64 + c)
      const localRef = `$${letter}$${rowNumber}`
      const absRef = sheetNameForRefs
        ? `'${sheetNameForRefs}'!${localRef}`
        : localRef
      const text =
        typeof v === "string" || typeof v === "number" || typeof v === "boolean"
          ? String(v)
          : formulaEquals(v)
            ? String(v.result ?? "")
            : ""
      if (text !== "" || typeof v === "string") {
        cells[localRef] = typeof v === "string" ? v : text
        if (sheetNameForRefs) cells[absRef] = cells[localRef]
      }
    }
  })
  return cells
}

const sampleBp: BestPractice = {
  version: 1,
  sections: [{ heading: "Naming", items: ["Use approved size list"] }],
}

test("namingWorkbookFilename includes mba, version, date", () => {
  const name = namingWorkbookFilename(
    "jayco001",
    3,
    new Date(Date.UTC(2026, 6, 22)),
  )
  assert.equal(name, "naming-jayco001-v3-20260722.xlsx")
})

test("buildNamingWorkbook: tab set/order, offline excluded, auto YouTube/Native", async () => {
  const lineItems = {
    digitalDisplay: [
      item({ line_item_id: "dd1", publisher: "Nine" }),
      item({ publisher: "Seven" }), // skipped — no id
    ],
    digitalVideo: [
      item({ line_item_id: "yt1", publisher: "YouTube" }),
      item({ line_item_id: "dv1", publisher: "Nine" }),
    ],
    progDisplay: [item({ line_item_id: "pd1", publisher: "DV360" })],
    search: [item({ line_item_id: "nat1", publisher: "Taboola" })],
    socialMedia: [item({ line_item_id: "sm1", publisher: "Meta" })],
    // offline — must not produce tabs
    television: [item({ line_item_id: "tv1", publisher: "Seven" })],
    radio: [item({ line_item_id: "ra1", publisher: "SCA" })],
  }

  const workbook = await buildNamingWorkbook({
    globals: {
      brand: "jayco",
      client: "jayco",
      campaign: "jayco001",
      mba: "jayco001",
      month_start: "jan26",
      campaign_start_date: "2026-01-01",
    },
    version: 2,
    lineItems,
    containerBestPractice: [
      {
        id: 1,
        media_container: "digidisplay",
        is_active: true,
        best_practice: sampleBp,
      },
    ],
    publishers: [
      {
        id: 10,
        publisher_name: "Nine",
        publisherid: "nine",
        publishertype: "direct",
        billingagency: "assembled media",
        financecode: "NINE",
        best_practice: sampleBp,
      } as Publisher,
    ],
  })

  const names = workbook.worksheets.map((s) => s.name)
  assert.equal(names[0], "Input sheet")
  assert.equal(names[names.length - 1], "Rules")

  const channelOrder = names.slice(1, -1)
  assert.deepEqual(channelOrder, [
    "Digital Display",
    "Digital Video",
    "Prog Display",
    "Search",
    "Social",
    "YouTube",
    "Native",
  ])
  assert.ok(!names.includes("Television"))
  assert.ok(!names.includes("Radio"))
})

test("buildNamingWorkbook: Input globals B1-B4, frozen header, skipped note", async () => {
  const workbook = await buildNamingWorkbook({
    globals: {
      brand: "jayco",
      client: "jayco",
      campaign: "jayco001",
      mba: "jayco001",
      month_start: "jan26",
      campaign_start_date: "2026-01-01",
    },
    version: 1,
    lineItems: {
      digitalDisplay: [
        item({ line_item_id: "dd1", publisher: "Nine", targeting: "A25" }),
        item({ publisher: "Seven", platform: "Seven" }),
        item({ publisher: "Seven" }),
      ],
    },
  })

  const input = workbook.getWorksheet("Input sheet")!
  assert.equal(input.getCell(1, 1).value, "brand")
  assert.equal(input.getCell(INPUT_GLOBAL_CELLS.brand.row, INPUT_GLOBAL_CELLS.brand.col).value, "jayco")
  assert.equal(input.getCell(2, 2).value, "jayco001")
  assert.equal(input.getCell(3, 2).value, "jayco001")
  assert.equal(input.getCell(4, 2).value, "jan26")

  assert.equal(input.getCell(INPUT_TABLE_HEADER_ROW, 1).value, INPUT_COLUMNS[0])
  assert.equal(
    input.getCell(INPUT_TABLE_DATA_START_ROW, 1).value,
    "dd1",
  )

  const views = input.views ?? []
  assert.ok(
    views.some((v) => v.state === "frozen" && v.ySplit === INPUT_TABLE_HEADER_ROW),
    "expected frozen header row",
  )

  const values = JSON.stringify(input.getSheetValues())
  assert.match(values, /Skipped rows/i)
  assert.match(values, /missing_line_item_id/)
  assert.match(values, /digitalDisplay/)
  assert.match(values, /Seven/)
  assert.match(values, /count:\s*2|2/)
})

test("buildNamingWorkbook: formula cells + value parity + shared campaign across cm360 tabs", async () => {
  const workbook = await buildNamingWorkbook({
    globals: {
      brand: "jayco",
      client: "jayco",
      campaign: "jayco001",
      mba: "jayco001",
      month_start: "jan26",
      campaign_start_date: "2026-01-01",
    },
    version: 1,
    lineItems: {
      digitalDisplay: [
        item({
          line_item_id: "dd1",
          publisher: "Nine",
          targetingAttribute: "retargeting",
        }),
      ],
      digitalVideo: [
        item({
          line_item_id: "dv1",
          publisher: "BVOD",
          targeting: "affinity",
        }),
      ],
    },
  })

  const input = workbook.getWorksheet("Input sheet")!
  const inputCells = cellMapFromSheet(input, "Input sheet")

  const campaignTpl = getTemplate("cm360", "campaign")!
  const expectedCampaign = composeName(campaignTpl, {
    brand: "jayco",
    campaign: "jayco001",
    mba: "jayco001",
    month_start: "jan26",
  })

  const campaignNames: string[] = []
  for (const sheetName of ["Digital Display", "Digital Video"]) {
    const sheet = workbook.getWorksheet(sheetName)!
    const localCells = { ...inputCells, ...cellMapFromSheet(sheet) }

    let foundCampaignFormula = false
    sheet.eachRow((row) => {
      for (let c = 1; c <= 12; c++) {
        const v = row.getCell(c).value
        if (!formulaEquals(v)) continue
        if (v.result !== expectedCampaign) continue
        const withEq = v.formula.startsWith("=") ? v.formula : `=${v.formula}`
        foundCampaignFormula = true
        const evaluated = evaluateNamingFormula(withEq, localCells)
        assert.equal(evaluated, expectedCampaign)
        campaignNames.push(String(v.result))
      }
    })
    assert.equal(foundCampaignFormula, true, `campaign formula on ${sheetName}`)
  }

  assert.equal(campaignNames[0], campaignNames[1])
  assert.equal(campaignNames[0], expectedCampaign)
})

test("buildNamingWorkbook: CM360 placement expands iab sizes; formula/value match", async () => {
  const workbook = await buildNamingWorkbook({
    globals: {
      brand: "jayco",
      client: "jayco",
      campaign: "jayco001",
      mba: "jayco001",
      month_start: "jan26",
      campaign_start_date: "2026-01-01",
    },
    version: 1,
    lineItems: {
      digitalDisplay: [
        item({
          line_item_id: "dd1",
          publisher: "Nine",
          targeting: "retargeting",
        }),
      ],
    },
  })

  const sheet = workbook.getWorksheet("Digital Display")!
  const input = workbook.getWorksheet("Input sheet")!
  const cells = { ...cellMapFromSheet(input, "Input sheet"), ...cellMapFromSheet(sheet) }

  const placementTpl = getTemplate("cm360", "placement")!
  const sizeCount = PICKLISTS.iab_sizes.length
  let placementFormulaRows = 0

  sheet.eachRow((row) => {
    for (let c = 1; c <= 20; c++) {
      const v = row.getCell(c).value
      if (!formulaEquals(v)) continue
      const withEq = v.formula.startsWith("=") ? v.formula : `=${v.formula}`
      if (!withEq.includes("dd1") && !String(v.result).includes("dd1")) continue
      // placement includes size + terminal id
      if (!String(v.result).includes("dd1")) continue
      if (placementTpl.elements.some((el) => el.key === "size")) {
        // Heuristic: result looks like placement (has size token + id)
        const result = String(v.result)
        if (result.endsWith("-dd1") || result.endsWith("_dd1") || result.includes("-dd1")) {
          placementFormulaRows++
          assert.notEqual(result, INVALID_NAME_CELL)
          const evaluated = evaluateNamingFormula(withEq, cells)
          // Value column is adjacent — find string equal to result
          let foundValue = false
          for (let c2 = 1; c2 <= 20; c2++) {
            if (row.getCell(c2).value === result) foundValue = true
          }
          assert.equal(foundValue, true, "value cell should equal formula result")
          assert.equal(evaluated, result)
        }
      }
    }
  })

  assert.ok(
    placementFormulaRows >= sizeCount,
    `expected ≥${sizeCount} placement formula rows, got ${placementFormulaRows}`,
  )
})

test("Prompt 5 smoke: prog+digital+social+search+YouTube — tabs, shared campaigns, formula≡value, pacing id", async () => {
  const lineItems = {
    digitalDisplay: [
      item({
        line_item_id: "dd1",
        publisher: "Nine",
        targeting: "retargeting",
        market: "NSW",
      }),
    ],
    digitalVideo: [
      item({
        line_item_id: "yt1",
        publisher: "YouTube",
        targeting: "affinity",
      }),
      item({
        line_item_id: "dv1",
        publisher: "Nine",
        targeting: "prospecting",
      }),
    ],
    progDisplay: [
      item({
        line_item_id: "pd1",
        publisher: "DV360",
        targeting: "retargeting",
      }),
    ],
    progVideo: [
      item({
        line_item_id: "pv1",
        publisher: "DV360",
        targeting: "prospecting",
      }),
    ],
    search: [
      item({
        line_item_id: "se1",
        publisher: "Google",
        targeting: "brand",
      }),
    ],
    socialMedia: [
      item({
        line_item_id: "sm1",
        publisher: "Meta",
        targeting: "lookalike",
      }),
    ],
    // offline must never become tabs even if present in a bag
    television: [item({ line_item_id: "tv1", publisher: "Seven" })],
    radio: [item({ line_item_id: "ra1", publisher: "SCA" })],
    newspapers: [item({ line_item_id: "np1", publisher: "News" })],
    cinema: [item({ line_item_id: "ci1", publisher: "Event" })],
    ooh: [item({ line_item_id: "oh1", publisher: "oOh!" })],
  }

  const workbook = await buildNamingWorkbook({
    globals: {
      brand: "jayco",
      client: "jayco",
      campaign: "jayco001",
      mba: "jayco001",
      month_start: "jan26",
      campaign_start_date: "2026-01-01",
    },
    version: 1,
    lineItems,
    containerBestPractice: [
      {
        id: 1,
        media_container: "digidisplay",
        is_active: true,
        best_practice: sampleBp,
      },
      {
        id: 2,
        media_container: "progdisplay",
        is_active: true,
        best_practice: sampleBp,
      },
    ],
    publishers: [
      {
        id: 10,
        publisher_name: "Nine",
        publisherid: "nine",
        publishertype: "direct",
        billingagency: "assembled media",
        financecode: "NINE",
        best_practice: sampleBp,
      } as Publisher,
      {
        id: 11,
        publisher_name: "YouTube",
        publisherid: "youtube",
        publishertype: "direct",
        billingagency: "assembled media",
        financecode: "YT",
        best_practice: sampleBp,
      } as Publisher,
    ],
  })

  const names = workbook.worksheets.map((s) => s.name)
  assert.equal(names[0], "Input sheet")
  assert.equal(names[names.length - 1], "Rules")
  assert.deepEqual(names.slice(1, -1), [
    "Digital Display",
    "Digital Video",
    "Prog Display",
    "Prog Video",
    "Search",
    "Social",
    "YouTube",
  ])
  for (const offline of ["Television", "Radio", "Newspapers", "Cinema", "OOH", "Native"]) {
    assert.ok(!names.includes(offline), `unexpected tab ${offline}`)
  }

  const input = workbook.getWorksheet("Input sheet")!
  const inputHeader = input.getRow(INPUT_TABLE_HEADER_ROW)
  const headerVals: string[] = []
  inputHeader.eachCell((cell) => headerVals.push(String(cell.value ?? "")))
  assert.ok(headerVals.includes("line_item_id"))
  assert.ok(INPUT_COLUMNS.includes("line_item_id"))

  const cm360Campaign = composeName(getTemplate("cm360", "campaign")!, {
    brand: "jayco",
    campaign: "jayco001",
    mba: "jayco001",
    month_start: "jan26",
  })
  const dv360Campaign = composeName(getTemplate("dv360", "campaign")!, {
    brand: "jayco",
    campaign: "jayco001",
    mba: "jayco001",
    month_start: "jan26",
  })
  assert.match(dv360Campaign, /programmatic/)

  const mismatches: string[] = []
  const collectCampaignResults = (sheetName: string): string[] => {
    const sheet = workbook.getWorksheet(sheetName)!
    const cells = {
      ...cellMapFromSheet(input, "Input sheet"),
      ...cellMapFromSheet(sheet),
    }
    const found: string[] = []
    sheet.eachRow((row, rowNumber) => {
      let formulaCol = -1
      let valueCol = -1
      let formulaResult = ""
      let formulaText = ""
      for (let c = 1; c <= 24; c++) {
        const v = row.getCell(c).value
        if (formulaEquals(v)) {
          formulaCol = c
          formulaResult = String(v.result ?? "")
          formulaText = v.formula.startsWith("=") ? v.formula : `=${v.formula}`
          valueCol = c + 1
        }
      }
      if (formulaCol < 0) return
      const valueCell = String(row.getCell(valueCol).value ?? "")
      if (formulaResult !== valueCell) {
        if (valueCell.startsWith("← add ")) {
          // Buyer-input prompt on value; formula result is the live partial name
          assert.ok(
            !formulaResult.endsWith("-"),
            `${sheetName} r${rowNumber}: dangling dash in needs-input formula result`,
          )
        } else {
          mismatches.push(
            `${sheetName} r${rowNumber}: formula result "${formulaResult}" ≠ value "${valueCell}"`,
          )
        }
      }
      const evaluated = evaluateNamingFormula(formulaText, cells)
      if (evaluated !== formulaResult && formulaResult !== INVALID_NAME_CELL) {
        mismatches.push(
          `${sheetName} r${rowNumber}: evaluated "${evaluated}" ≠ result "${formulaResult}"`,
        )
      }
      if (formulaResult === cm360Campaign || formulaResult === dv360Campaign) {
        found.push(formulaResult)
      }
    })
    return found
  }

  const digitalCampaigns = [
    ...collectCampaignResults("Digital Display"),
    ...collectCampaignResults("Digital Video"),
  ]
  assert.ok(digitalCampaigns.length >= 2)
  assert.ok(digitalCampaigns.every((c) => c === cm360Campaign))

  const progCampaigns = [
    ...collectCampaignResults("Prog Display"),
    ...collectCampaignResults("Prog Video"),
  ]
  assert.ok(progCampaigns.length >= 2)
  assert.ok(progCampaigns.every((c) => c === dv360Campaign))

  for (const sheetName of names.slice(1, -1)) {
    collectCampaignResults(sheetName)
    const sheet = workbook.getWorksheet(sheetName)!
    // pacing-grain composed names must end with -<line_item_id> when compose succeeds
    let pacingEndsWithId = 0
    let invalidPacing = 0
    sheet.eachRow((row) => {
      for (let c = 1; c <= 24; c++) {
        const v = row.getCell(c).value
        if (!formulaEquals(v) && v !== INVALID_NAME_CELL) continue
        const result =
          typeof v === "string" ? v : formulaEquals(v) ? String(v.result ?? "") : ""
        const valueCell = String(row.getCell(c + (formulaEquals(v) ? 1 : 0)).value ?? "")
        if (formulaEquals(v)) {
          if (String(valueCell).startsWith("← add ")) {
            // Value column is the buyer prompt; formula result is the live partial name
            assert.notEqual(result, INVALID_NAME_CELL)
            assert.ok(!String(result).endsWith("-"), `dangling dash in ${sheetName}: ${result}`)
          } else {
            assert.equal(valueCell, result)
          }
        }
        if (/-(dd1|yt1|dv1|pd1|pv1|se1|sm1)$/.test(result)) {
          pacingEndsWithId += 1
        }
        if (result === INVALID_NAME_CELL && String(row.getCell(c - 1)?.value ?? "").match(/^(dd1|yt1|dv1|pd1|pv1|se1|sm1)$/)) {
          invalidPacing += 1
        }
      }
    })
    if (["Digital Display", "Prog Display", "YouTube"].includes(sheetName)) {
      assert.ok(
        pacingEndsWithId >= 1,
        `${sheetName} should have pacing-grain names ending in -line_item_id`,
      )
    }
    // Search/Social seed required free tokens empty → ← add … in AV (not INVALID)
    if (sheetName === "Search" || sheetName === "Social") {
      assert.ok(
        pacingEndsWithId + invalidPacing >= 1 ||
          JSON.stringify(sheet.getSheetValues()).includes("se1") ||
          JSON.stringify(sheet.getSheetValues()).includes("sm1") ||
          JSON.stringify(sheet.getSheetValues()).includes("← add "),
        `${sheetName} should still show line_item_id on the grain row or needs-input prompt`,
      )
    }
  }

  // Rails render when container/publisher BP exists (empty containers skip the block)
  const ddText = JSON.stringify(workbook.getWorksheet("Digital Display")!.getSheetValues())
  assert.match(ddText, /Best Practice - Digital Display/)
  assert.match(ddText, /Best Practice - Nine/)
  const pdText = JSON.stringify(workbook.getWorksheet("Prog Display")!.getSheetValues())
  assert.match(pdText, /Best Practice - Prog Display/)

  assert.deepEqual(mismatches, [], mismatches.join("\n") || "no mismatches")
})

test("buildNamingWorkbook: per-channel best-practice rail present", async () => {
  const workbook = await buildNamingWorkbook({
    globals: {
      brand: "jayco",
      client: "jayco",
      campaign: "jayco001",
      mba: "jayco001",
      month_start: "jan26",
      campaign_start_date: "2026-01-01",
    },
    version: 1,
    lineItems: {
      digitalDisplay: [item({ line_item_id: "dd1", publisher: "Nine" })],
    },
    containerBestPractice: [
      {
        id: 1,
        media_container: "digidisplay",
        is_active: true,
        best_practice: sampleBp,
      } satisfies MediaContainerBestPractice,
    ],
    publishers: [
      {
        id: 10,
        publisher_name: "Nine",
        publisherid: "nine",
        publishertype: "direct",
        billingagency: "assembled media",
        financecode: "NINE",
        best_practice: {
          version: 1,
          sections: [{ heading: "Nine", items: ["Site list required"] }],
        },
      } as Publisher,
    ],
  })

  const sheet = workbook.getWorksheet("Digital Display")!
  const text = JSON.stringify(sheet.getSheetValues())
  assert.match(text, /Best Practice - Digital Display/)
  assert.match(text, /Use approved size list/)
  assert.match(text, /Best Practice - Nine/)
  assert.match(text, /Site list required/)
})

test("buildNamingWorkbook: needs-input prompt vs INVALID for required free / hard failures", async () => {
  const workbook = await buildNamingWorkbook({
    globals: {
      brand: "jayco",
      client: "jayco",
      campaign: "jayco001",
      mba: "jayco001",
      month_start: "jan26",
      campaign_start_date: "2026-01-01",
    },
    version: 1,
    lineItems: {
      search: [item({ line_item_id: "se1", publisher: "Google" })],
      progVideo: [
        item({ line_item_id: "pv1", publisher: "DV360", targeting: "Affinity" }),
      ],
      digitalVideo: [
        item({ line_item_id: "yt1", publisher: "YouTube", targeting: "Affinity" }),
      ],
    },
  })

  const rulesText = JSON.stringify(workbook.getWorksheet("Rules")!.getSheetValues())
  assert.match(rulesText, /← add .+ in AV/)

  // Search campaign: empty match_context → needs-input prompt + live formula
  {
    const search = workbook.getWorksheet("Search")!
    let campaignDataRow: {
      getCell: (c: number) => { value: unknown }
      number: number
    } | null = null
    let keys: string[] = []
    let sawCampaign = false
    search.eachRow((row) => {
      if (campaignDataRow) return
      const a = String(row.getCell(1).value ?? "")
      if (a === "Campaign") {
        sawCampaign = true
        keys = []
        return
      }
      if (!sawCampaign) return
      if (keys.length === 0) {
        for (let c = 1; c <= 20; c++) {
          const h = String(row.getCell(c).value ?? "")
          if (!h) break
          keys.push(h)
        }
        return
      }
      campaignDataRow = row
    })
    assert.ok(campaignDataRow)
    const valueCol = keys.indexOf("Composed name (value)") + 1
    const formulaCol = keys.indexOf("Composed name (formula)") + 1
    const matchCol = keys.indexOf("match_context") + 1
    assert.equal(
      campaignDataRow!.getCell(valueCol).value,
      "← add match_context in AV",
    )
    const formulaCell = campaignDataRow!.getCell(formulaCol).value
    assert.ok(formulaEquals(formulaCell), "expected live formula for needs-input")
    const withEq = `=${formulaCell.formula}`
    const cells = {
      ...cellMapFromSheet(workbook.getWorksheet("Input sheet")!, "Input sheet"),
      ...cellMapFromSheet(search),
    }
    assert.equal(evaluateNamingFormula(withEq, cells), "jayco-jayco001-search")
    const matchRef = `$${String.fromCharCode(64 + matchCol)}$${campaignDataRow!.number}`
    cells[matchRef] = "brand"
    assert.equal(
      evaluateNamingFormula(withEq, cells),
      "jayco-jayco001-search-brand",
    )
  }

  // DV360 + YouTube ad empty token → needs-input
  for (const sheetName of ["Prog Video", "YouTube"]) {
    const sheet = workbook.getWorksheet(sheetName)!
    let inAd = false
    let keys: string[] = []
    let adRow: { getCell: (c: number) => { value: unknown }; number: number } | null =
      null
    sheet.eachRow((row) => {
      if (adRow) return
      const a = String(row.getCell(1).value ?? "")
      if (a === "Ad") {
        inAd = true
        keys = []
        return
      }
      if (!inAd) return
      if (keys.length === 0) {
        for (let c = 1; c <= 20; c++) {
          const h = String(row.getCell(c).value ?? "")
          if (!h) break
          keys.push(h)
        }
        return
      }
      adRow = row
    })
    assert.ok(adRow, `${sheetName} Ad row`)
    const valueCol = keys.indexOf("Composed name (value)") + 1
    const formulaCol = keys.indexOf("Composed name (formula)") + 1
    const tokenCol = keys.indexOf("token") + 1
    assert.equal(
      adRow!.getCell(valueCol).value,
      "← add token in AV",
      `${sheetName} value`,
    )
    const formulaCell = adRow!.getCell(formulaCol).value
    assert.ok(formulaEquals(formulaCell), `${sheetName} formula`)
    const withEq = `=${formulaCell.formula}`
    const cells = {
      ...cellMapFromSheet(workbook.getWorksheet("Input sheet")!, "Input sheet"),
      ...cellMapFromSheet(sheet),
    }
    const evaluatedBlank = evaluateNamingFormula(withEq, cells)
    assert.ok(
      !evaluatedBlank.endsWith("-"),
      `${sheetName} dangling dash: ${evaluatedBlank}`,
    )
    const tokenRef = `$${String.fromCharCode(64 + tokenCol)}$${adRow!.number}`
    cells[tokenRef] = "bumper"
    const evaluatedFilled = evaluateNamingFormula(withEq, cells)
    assert.ok(
      evaluatedFilled.endsWith("-bumper"),
      `${sheetName} filled: ${evaluatedFilled}`,
    )
  }

  assert.equal(INVALID_NAME_CELL, "INVALID: fix in AV")
})
