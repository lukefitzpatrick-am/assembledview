/**
 * Patches expertGridGoldenParity.test.ts with Radio/Cinema/DigiVideo fixtures.
 * Run: node scripts/_patch-p1-golden-test.mjs
 */
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const root = process.cwd()
const testPath = join(root, "lib/mediaplan/__tests__/expertGridGoldenParity.test.ts")
const snippetPath = join(root, "p1_goldens_snippet.ts")

// Normalize CRLF so needle matching works on Windows checkouts.
let src = readFileSync(testPath, "utf8").replace(/\r\n/g, "\n")
const snippet = readFileSync(snippetPath, "utf8").replace(/\r\n/g, "\n").trimEnd() + "\n"

src = src.replace(
  ` * Pins map*ExpertRowsToStandardLineItems + computeLoadedDeliverables for
 * Search / OOH / ProgVideo to the cent — do not change expected values without
 * intentional behaviour change review.
 *
 * Regenerate via: npx tsx lib/mediaplan/__tests__/_dumpExpertGoldens.ts
 */`,
  ` * Pins map*ExpertRowsToStandardLineItems + computeLoadedDeliverables for
 * Search / OOH / ProgVideo / Radio / Cinema / DigiVideo to the cent — do not
 * change expected values without intentional behaviour change review.
 *
 * Regenerate Search/OOH/ProgVideo via: npx tsx lib/mediaplan/__tests__/_dumpExpertGoldens.ts
 * Regenerate Radio/Cinema/DigiVideo via: npx tsx lib/mediaplan/__tests__/_dumpP1Goldens.ts
 */`
)

src = src.replace(
  `import {
  mapOohExpertRowsToStandardLineItems,
  mapProgVideoExpertRowsToStandardLineItems,
  mapSearchExpertRowsToStandardLineItems,
} from "@/lib/mediaplan/expertChannelMappings"
import type {
  ExpertWeeklyValues,
  OohExpertScheduleRow,
  ProgVideoExpertScheduleRow,
  SearchExpertScheduleRow,
} from "@/lib/mediaplan/expertModeWeeklySchedule"`,
  `import {
  mapCinemaExpertRowsToStandardLineItems,
  mapDigiVideoExpertRowsToStandardLineItems,
  mapOohExpertRowsToStandardLineItems,
  mapProgVideoExpertRowsToStandardLineItems,
  mapRadioExpertRowsToStandardLineItems,
  mapSearchExpertRowsToStandardLineItems,
} from "@/lib/mediaplan/expertChannelMappings"
import type {
  CinemaExpertScheduleRow,
  DigiVideoExpertScheduleRow,
  ExpertWeeklyValues,
  OohExpertScheduleRow,
  ProgVideoExpertScheduleRow,
  RadioExpertScheduleRow,
  SearchExpertScheduleRow,
} from "@/lib/mediaplan/expertModeWeeklySchedule"`
)

const rowsBlock = `
const RADIO_ROWS: RadioExpertScheduleRow[] = [
  {
    id: "R1",
    startDate: "2026-01-05",
    endDate: "2026-01-25",
    network: "SCA",
    station: "2DAY",
    market: "SYD",
    placement: "Breakfast",
    duration: "30s",
    format: "Spot",
    buyingDemo: "A25-54",
    buyType: "spots",
    fixedCostMedia: false,
    clientPaysForMedia: false,
    budgetIncludesFees: true,
    unitRate: 250,
    grossCost: 0,
    weeklyValues: { ...emptyWeekly(), [weekKeys[0]]: 10, [weekKeys[1]]: 5 },
    mergedWeekSpans: [],
  },
  {
    id: "R2",
    startDate: "2026-01-05",
    endDate: "2026-01-25",
    network: "ARN",
    station: "KIIS",
    market: "MEL",
    placement: "",
    duration: "",
    format: "",
    buyingDemo: "",
    buyType: "package_inclusions",
    fixedCostMedia: true,
    clientPaysForMedia: false,
    budgetIncludesFees: false,
    unitRate: 0,
    grossCost: 0,
    weeklyValues: { ...emptyWeekly(), [weekKeys[0]]: 100 },
    mergedWeekSpans: [],
  },
]

const CINEMA_ROWS: CinemaExpertScheduleRow[] = [
  {
    id: "C1",
    startDate: "2026-01-05",
    endDate: "2026-01-25",
    network: "Event",
    station: "Bondi",
    market: "SYD",
    placement: "Pre-show",
    duration: "30s",
    format: "Spot",
    buyingDemo: "A18-39",
    buyType: "spots",
    fixedCostMedia: false,
    clientPaysForMedia: false,
    budgetIncludesFees: true,
    unitRate: 180,
    grossCost: 0,
    weeklyValues: { ...emptyWeekly(), [weekKeys[0]]: 8, [weekKeys[1]]: 4 },
    mergedWeekSpans: [],
  },
  {
    id: "C2",
    startDate: "2026-01-05",
    endDate: "2026-01-25",
    network: "HOYTS",
    station: "Chadstone",
    market: "MEL",
    placement: "",
    duration: "",
    format: "",
    buyingDemo: "",
    buyType: "bonus",
    fixedCostMedia: false,
    clientPaysForMedia: true,
    budgetIncludesFees: false,
    unitRate: 0,
    grossCost: 0,
    weeklyValues: { ...emptyWeekly(), [weekKeys[0]]: 50 },
    mergedWeekSpans: [],
  },
]

const DIGI_VIDEO_ROWS: DigiVideoExpertScheduleRow[] = [
  {
    id: "DV1",
    startDate: "2026-01-05",
    endDate: "2026-01-25",
    platform: "YouTube",
    publisher: "Google",
    site: "yt.com",
    bidStrategy: "views",
    buyType: "cpv",
    placement: "instream",
    size: "15s",
    creativeTargeting: "ctx",
    creative: "v1",
    buyingDemo: "A25-54",
    market: "AU",
    fixedCostMedia: false,
    clientPaysForMedia: false,
    budgetIncludesFees: true,
    unitRate: 0.05,
    grossCost: 0,
    weeklyValues: { ...emptyWeekly(), [weekKeys[0]]: 15000, [weekKeys[1]]: 5000 },
    mergedWeekSpans: [],
  },
  {
    id: "DV2",
    startDate: "2026-01-05",
    endDate: "2026-01-25",
    platform: "Meta",
    publisher: "Meta",
    site: "",
    bidStrategy: "",
    buyType: "cpm",
    placement: "",
    size: "",
    creativeTargeting: "",
    creative: "",
    buyingDemo: "",
    market: "",
    fixedCostMedia: false,
    clientPaysForMedia: false,
    budgetIncludesFees: false,
    unitRate: 12,
    grossCost: 0,
    weeklyValues: { ...emptyWeekly(), [weekKeys[0]]: 80000 },
    mergedWeekSpans: [],
  },
]

`

const insertMarker = 'test("golden: campaign week keys for fixture window"'
if (!src.includes(insertMarker)) {
  throw new Error("insert marker not found")
}
if (src.includes("RADIO_GOLDEN")) {
  throw new Error("already patched")
}

src = src.replace(
  insertMarker,
  rowsBlock + snippet + "\n" + insertMarker
)

const afterProgMap = `test("golden: mapProgVideoExpertRowsToStandardLineItems matches frozen ProgVideo output", () => {
  const lines = mapProgVideoExpertRowsToStandardLineItems(
    PROG_VIDEO_ROWS,
    weekColumns,
    CS,
    CE,
    { feePctProgVideo: 12 }
  )
  assert.deepEqual(lines.map(serializeLine), PROG_VIDEO_GOLDEN)
})
`

const newMapTests = afterProgMap + `
test("golden: mapRadioExpertRowsToStandardLineItems matches frozen Radio output", () => {
  const lines = mapRadioExpertRowsToStandardLineItems(RADIO_ROWS, weekColumns, CS, CE, {
    feePctRadio: 10,
  })
  assert.deepEqual(lines.map(serializeLine), RADIO_GOLDEN)
})

test("golden: mapCinemaExpertRowsToStandardLineItems matches frozen Cinema output", () => {
  const lines = mapCinemaExpertRowsToStandardLineItems(CINEMA_ROWS, weekColumns, CS, CE, {
    feePctCinema: 10,
  })
  assert.deepEqual(lines.map(serializeLine), CINEMA_GOLDEN)
})

test("golden: mapDigiVideoExpertRowsToStandardLineItems matches frozen DigiVideo output", () => {
  const lines = mapDigiVideoExpertRowsToStandardLineItems(
    DIGI_VIDEO_ROWS,
    weekColumns,
    CS,
    CE,
    { feePctDigiVideo: 10 }
  )
  assert.deepEqual(lines.map(serializeLine), DIGI_VIDEO_GOLDEN)
})
`

if (!src.includes(afterProgMap)) {
  throw new Error("prog map test block not found")
}
src = src.replace(afterProgMap, newMapTests)

const deliverableInsert = `    // ProgVideo PV2 — CPM no fees
    {
      buyType: "cpm",
      burst: { budget: "1500", buyAmount: "15" },
      budgetIncludesFees: false,
      feePct: 0,
      expected: 100000,
    },
  ]`

const deliverableExtra = `    // ProgVideo PV2 — CPM no fees
    {
      buyType: "cpm",
      burst: { budget: "1500", buyAmount: "15" },
      budgetIncludesFees: false,
      feePct: 0,
      expected: 100000,
    },
    // Radio R1 — spots with fees (qty passthrough)
    {
      buyType: "spots",
      burst: { budget: "2777.78", buyAmount: "250" },
      budgetIncludesFees: true,
      feePct: 10,
      expected: 10,
    },
    // Radio R2 — package_inclusions
    {
      buyType: "package_inclusions",
      burst: { budget: "0", buyAmount: "0", calculatedValue: 100 },
      budgetIncludesFees: false,
      feePct: 0,
      expected: 100,
    },
    // Cinema C1 — spots with fees
    {
      buyType: "spots",
      burst: { budget: "1600", buyAmount: "180" },
      budgetIncludesFees: true,
      feePct: 10,
      expected: 8,
    },
    // Cinema C2 — bonus
    {
      buyType: "bonus",
      burst: { budget: "0", buyAmount: "0", calculatedValue: 50 },
      budgetIncludesFees: false,
      feePct: 0,
      expected: 50,
    },
    // DigiVideo DV1 — CPV with fees (mapper calculatedValue after fee strip)
    {
      buyType: "cpv",
      burst: { budget: "750", buyAmount: "0.05", calculatedValue: 13500 },
      budgetIncludesFees: true,
      feePct: 10,
      expected: 13500,
    },
    // DigiVideo DV2 — CPM no fees
    {
      buyType: "cpm",
      burst: { budget: "960", buyAmount: "12" },
      budgetIncludesFees: false,
      feePct: 0,
      expected: 80000,
    },
  ]`

if (!src.includes(deliverableInsert)) {
  throw new Error("deliverable cases insert point not found")
}
src = src.replace(deliverableInsert, deliverableExtra)

// Rename + extend parity test
src = src.replace(
  'test("golden: Search/OOH/ProgVideo mapped calculatedValue equals computeLoadedDeliverables", () => {',
  'test("golden: Search/OOH/ProgVideo/Radio/Cinema/DigiVideo mapped calculatedValue equals computeLoadedDeliverables", () => {'
)

const parityTail = `  for (const line of prog) {
    for (const burst of line.bursts) {
      const loaded = computeLoadedDeliverables(
        line.buyType,
        {
          budget: burst.budget,
          buyAmount: String(burst.buyAmount).replace(/[^0-9.-]/g, ""),
          calculatedValue: burst.calculatedValue,
        },
        Boolean(line.budgetIncludesFees),
        12
      )
      assert.equal(
        loaded,
        burst.calculatedValue,
        \`ProgVideo \${line.line_item_id} \${format(startOfDay(burst.startDate), "yyyy-MM-dd")}\`
      )
    }
  }
})
`

const parityExtra = `  for (const line of prog) {
    for (const burst of line.bursts) {
      const loaded = computeLoadedDeliverables(
        line.buyType,
        {
          budget: burst.budget,
          buyAmount: String(burst.buyAmount).replace(/[^0-9.-]/g, ""),
          calculatedValue: burst.calculatedValue,
        },
        Boolean(line.budgetIncludesFees),
        12
      )
      assert.equal(
        loaded,
        burst.calculatedValue,
        \`ProgVideo \${line.line_item_id} \${format(startOfDay(burst.startDate), "yyyy-MM-dd")}\`
      )
    }
  }

  const radio = mapRadioExpertRowsToStandardLineItems(RADIO_ROWS, weekColumns, CS, CE, {
    feePctRadio: 10,
  })
  for (const line of radio) {
    for (const burst of line.bursts) {
      const loaded = computeLoadedDeliverables(
        line.buyType,
        {
          budget: burst.budget,
          buyAmount: String(burst.buyAmount).replace(/[^0-9.-]/g, ""),
          calculatedValue: burst.calculatedValue,
        },
        Boolean(line.budgetIncludesFees),
        10
      )
      assert.equal(
        loaded,
        burst.calculatedValue,
        \`Radio \${line.line_item_id} \${format(startOfDay(burst.startDate), "yyyy-MM-dd")}\`
      )
    }
  }

  const cinema = mapCinemaExpertRowsToStandardLineItems(CINEMA_ROWS, weekColumns, CS, CE, {
    feePctCinema: 10,
  })
  for (const line of cinema) {
    for (const burst of line.bursts) {
      const loaded = computeLoadedDeliverables(
        line.buyType,
        {
          budget: burst.budget,
          buyAmount: String(burst.buyAmount).replace(/[^0-9.-]/g, ""),
          calculatedValue: burst.calculatedValue,
        },
        Boolean(line.budgetIncludesFees),
        10
      )
      assert.equal(
        loaded,
        burst.calculatedValue,
        \`Cinema \${line.line_item_id} \${format(startOfDay(burst.startDate), "yyyy-MM-dd")}\`
      )
    }
  }

  const digiVideo = mapDigiVideoExpertRowsToStandardLineItems(
    DIGI_VIDEO_ROWS,
    weekColumns,
    CS,
    CE,
    { feePctDigiVideo: 10 }
  )
  for (const line of digiVideo) {
    for (const burst of line.bursts) {
      const loaded = computeLoadedDeliverables(
        line.buyType,
        {
          budget: burst.budget,
          buyAmount: String(burst.buyAmount).replace(/[^0-9.-]/g, ""),
          calculatedValue: burst.calculatedValue,
        },
        Boolean(line.budgetIncludesFees),
        10
      )
      assert.equal(
        loaded,
        burst.calculatedValue,
        \`DigiVideo \${line.line_item_id} \${format(startOfDay(burst.startDate), "yyyy-MM-dd")}\`
      )
    }
  }
})
`

if (!src.includes(parityTail)) {
  throw new Error("parity tail not found — check escaping")
}
src = src.replace(parityTail, parityExtra)

writeFileSync(testPath, src, "utf8")
console.log("patched", testPath)
