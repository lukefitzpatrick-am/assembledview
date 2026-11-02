/**
 * B4 parity (2 Nov 2026): the media plan editor now reads saved billing
 * through the shared lib parser. Every saved shape gives the same months and
 * cents as the editor's old inline parser (frozen in fixtures/), except the
 * three rows Luke decided (P5, P6):
 *   1. old Xano layout, Search or Social, no saved fee: the saved fee ($0), no estimate;
 *   2. a negative line amount keeps its minus sign;
 *   3. a negative saved fee or total keeps its minus sign;
 * plus row 4: line items with no month media total get it rebuilt from the
 * line items (the old editor got the same header cents by inference: total
 * minus fee, ad serving and production, and dropped the line items).
 * The reviewer's probe cases (F3) are documented differences too: the editor
 * now reads them as finance does. Live: 0 of each (2 Nov 2026).
 */
import assert from "node:assert/strict"
import test from "node:test"

import { parsePersistedBillingScheduleToMonths } from "../parsePersistedBillingScheduleToMonths"
import { parseSavedBillingForEditor } from "@/lib/mediaplan/parseSavedBillingForEditor"
import { legacyEditorParse } from "./fixtures/legacyEditorBillingParse"
import { parseMoney } from "@/lib/money"

const FEES = { searchFee: 15, socialFee: 12 }
const plain = (v: unknown) => JSON.parse(JSON.stringify(v))
const cents = (v: unknown) => Math.round((parseMoney(v) ?? 0) * 100)
const headers = (months: Array<Record<string, unknown>>) =>
  months.map((m) => ({
    month: m.monthYear,
    media: cents(m.mediaTotal),
    fee: cents(m.feeTotal),
    adserving: cents(m.adservingTechFees),
    production: cents(m.production),
    total: cents(m.totalAmount),
  }))

const PARTIAL = {
  isPartial: true,
  selectedMonthYears: ["October 2026"],
  channels: [{ mediaKey: "search", mediaType: "Search", selectedLineItemIds: ["billing-search::golf025SE1"], selectedTotal: "$1,000.00", fullChannelTotal: "$2,000.00", selectedCount: 1, totalCount: 2 }],
  totals: { grossMedia: "$1,000.00", assembledFee: "$150.00", adServing: "$0.00", production: "$0.00", totalInvestment: "$1,150.00" },
  note: "",
  updatedAt: "2026-10-01T00:00:00Z",
}

/** Shapes the switch must not change at all. */
const SAME: Record<string, unknown> = {
  "app layout: headers, line items, manual fee lane, partial approval": [
    { monthYear: "October 2026", mediaTotal: "$10,000.00", feeTotal: "$1,500.00", totalAmount: "$11,700.00", adservingTechFees: "$200.00", production: "$0.00",
      mediaCosts: { search: "$10,000.00", production: "$0.00" },
      lineItems: { search: [{ id: "billing-search::golf025SE1", header1: "Google", header2: "Brand", monthlyAmounts: { "October 2026": 10000, "November 2026": 0 }, totalAmount: 10000, billingMode: "manual", feeMonthlyAmounts: { "October 2026": 1500 }, totalFeeAmount: 1500 }] },
      partialApproval: PARTIAL },
    { monthYear: "November 2026", mediaTotal: "$0.00", feeTotal: "$0.00", totalAmount: "$0.00", adservingTechFees: "$0.00", production: "$0.00", mediaCosts: { search: "$0.00" } },
  ],
  "app layout as a JSON string": JSON.stringify([{ monthYear: "October 2026", mediaTotal: "$5.00", feeTotal: "$1.00", totalAmount: "$6.00", adservingTechFees: "$0.00", production: "$0.00", mediaCosts: {} }]),
  "app layout in a {months} wrapper": { months: [{ monthYear: "October 2026", mediaTotal: "$5.00", feeTotal: "$1.00", totalAmount: "$6.00", adservingTechFees: "$0.00", production: "$0.00", mediaCosts: {} }] },
  "app layout with AA ad serving and a production line": [
    { monthYear: "July 2026", mediaTotal: "$8,000.00", feeTotal: "$1,200.00", adservingTechFees: "$350.00", production: "$2,500.00", totalAmount: "$12,050.00",
      mediaCosts: { digiVideo: "$8,000.00", production: "$2,500.00" },
      lineItems: {
        digiVideo: [{ id: "billing-digiVideo::aa001DV1", header1: "Nine", header2: "9Now", monthlyAmounts: { "July 2026": 8000 }, totalAmount: 8000, clientPaysForMedia: false }],
        production: [{ id: "billing-production::aa001PROD1", header1: "Prod", header2: "TVC", monthlyAmounts: { "July 2026": 2500 }, totalAmount: 2500 }],
      } },
  ],
  "old Xano layout: saved fee, TV and Production lines, two months": [
    { monthYear: "July 2026", feeTotal: "$1,234.56", adservingTechFees: "$300.00", production: "$500.00", totalAmount: "$12,034.56",
      mediaTypes: [
        { mediaType: "Television", lineItems: [{ header1: "Seven", header2: "Sydney", amount: "$10,000.00", lineItemId: "aa001TV1" }] },
        { mediaType: "Production", lineItems: [{ header1: "Prod", header2: "TVC", amount: "$500.00", lineItemId: "aa001PROD1" }] },
      ] },
    { monthYear: "August 2026", feeTotal: "$100.00", adservingTechFees: "$0.00", production: "$0.00", totalAmount: "$2,100.00",
      mediaTypes: [{ mediaType: "Television", lineItems: [{ header1: "Seven", header2: "Sydney", amount: "$2,000.00", lineItemId: "aa001TV1" }] }] },
  ],
  "old Xano layout, Search with a saved fee": [
    { monthYear: "July 2026", feeTotal: "$176.47", mediaTypes: [{ mediaType: "Search", lineItems: [{ header1: "Google", header2: "Brand", amount: "$1,000.00", lineItemId: "golf006SE1" }] }] },
  ],
  "old Xano layout, TV only, no saved fee": [
    { monthYear: "July 2026", mediaTypes: [{ mediaType: "Television", lineItems: [{ header1: "Seven", header2: "", amount: "$1,000.00" }] }] },
  ],
  "old total-only rows (MBA PDF shape)": [
    { monthYear: "July 2026", totalAmount: "$11,500.00", feeTotal: "$1,500.00", adservingTechFees: "$0.00", production: "$0.00" },
    { monthYear: "August 2026", amount: "$2,000.00" },
  ],
  "manual rows: per-line fee, client pays, numeric amounts": [
    { monthYear: "July 2026", feeTotal: "$150.00", mediaTypes: [{ mediaType: "Search", lineItems: [
      { header1: "Google", header2: "A", amount: 1000, lineItemId: "x1SE1", billingMode: "manual", feeAmount: 150, mediaAmount: 1000, publisher: "Google", buyType: "cpc" },
      { header1: "Google", header2: "B", amount: 0, lineItemId: "x1SE2", clientPaysForMedia: true, billingMode: "auto" },
    ] }] },
    { monthYear: "August 2026", feeTotal: "$75.00", mediaTypes: [{ mediaType: "Search", lineItems: [{ header1: "Google", header2: "A", amount: 500, lineItemId: "x1SE1", billingMode: "manual", feeAmount: 75 }] }] },
  ],
  "snake_case keys": [
    { month_year: "July 2026", feeTotal: "$15.00", media_types: [{ media_type: "Television", lineItems: [{ header1: "Seven", header2: "", amount: "$100.00", line_item_id: "x1TV1" }] }] },
  ],
  "old Xano layout with partial approval": [
    { monthYear: "October 2026", feeTotal: "$150.00", partialApproval: PARTIAL, mediaTypes: [{ mediaType: "Search", lineItems: [{ header1: "Google", header2: "Brand", amount: "$1,000.00", lineItemId: "golf025SE1" }] }] },
  ],
}

test("every shape except the decided rows: identical months and cents, total and partial", () => {
  for (const [name, schedule] of Object.entries(SAME)) {
    const legacy = legacyEditorParse(schedule, FEES)
    const lib = parsePersistedBillingScheduleToMonths(schedule)
    assert.deepEqual(plain(lib), plain(legacy?.months), name)
    const editor = parseSavedBillingForEditor(schedule)
    assert.equal(editor?.billingTotalFormatted, legacy?.billingTotalFormatted, name)
    assert.deepEqual(plain(editor?.partial), plain(legacy?.partial), name)
  }
  assert.equal(parsePersistedBillingScheduleToMonths([]), null)
  assert.equal(parseSavedBillingForEditor(null), null)
})

test("row 1 (P5): old Xano Search/Social with no saved fee shows the saved fee, no 15% or 12% estimate", () => {
  for (const feeTotal of [undefined, "$0.00"]) {
    const schedule = [
      { monthYear: "July 2026", ...(feeTotal ? { feeTotal } : {}), adservingTechFees: "$0.00", production: "$0.00",
        mediaTypes: [
          { mediaType: "Search", lineItems: [{ header1: "Google", header2: "Brand", amount: "$1,000.00" }] },
          { mediaType: "Social Media", lineItems: [{ header1: "Meta", header2: "Reach", amount: 500 }] },
        ] },
    ]
    const legacy = legacyEditorParse(schedule, FEES)!
    const lib = parsePersistedBillingScheduleToMonths(schedule)!
    assert.deepEqual(headers(plain(legacy.months)), [{ month: "July 2026", media: 150000, fee: 24465, adserving: 0, production: 0, total: 174465 }], "the old estimate")
    assert.deepEqual(headers(plain(lib)), [{ month: "July 2026", media: 150000, fee: 0, adserving: 0, production: 0, total: 150000 }])
    // Everything but the fee and the total is unchanged, line items included.
    assert.deepEqual(plain(lib[0]!.lineItems), plain(legacy.months[0]!.lineItems))
    assert.deepEqual(plain(lib[0]!.mediaCosts), plain(legacy.months[0]!.mediaCosts))
    assert.equal(parseSavedBillingForEditor(schedule)!.billingTotalFormatted, "$1,500.00")
  }
})

test("row 2 (P5): a negative line amount keeps its minus sign", () => {
  const schedule = [{ monthYear: "July 2026", feeTotal: "$10.00", mediaTypes: [{ mediaType: "Television", lineItems: [{ header1: "Seven", header2: "", amount: "-$500.00", lineItemId: "x1TV1" }] }] }]
  const legacy = legacyEditorParse(schedule, FEES)!
  const lib = parsePersistedBillingScheduleToMonths(schedule)!
  assert.deepEqual(headers(plain(legacy.months)), [{ month: "July 2026", media: 50000, fee: 1000, adserving: 0, production: 0, total: 51000 }], "old: minus dropped")
  assert.deepEqual(headers(plain(lib)), [{ month: "July 2026", media: -50000, fee: 1000, adserving: 0, production: 0, total: -49000 }])
  assert.equal((lib[0]!.lineItems as Record<string, Array<{ totalAmount: number }>>).television![0]!.totalAmount, -500)
  assert.equal(parseSavedBillingForEditor(schedule)!.billingTotalFormatted, "-$490.00")
})

test("row 3 (P6): a negative saved fee or total keeps its minus sign", () => {
  const schedule = [{ monthYear: "July 2026", feeTotal: "-$50.00", mediaTypes: [{ mediaType: "Television", lineItems: [{ header1: "Seven", header2: "", amount: "$500.00", lineItemId: "x1TV1" }] }] }]
  const legacy = legacyEditorParse(schedule, FEES)!
  const lib = parsePersistedBillingScheduleToMonths(schedule)!
  assert.deepEqual(headers(plain(legacy.months)), [{ month: "July 2026", media: 50000, fee: 5000, adserving: 0, production: 0, total: 55000 }], "old: -$50 read as +$50")
  assert.deepEqual(headers(plain(lib)), [{ month: "July 2026", media: 50000, fee: -5000, adserving: 0, production: 0, total: 45000 }])
  assert.equal(lib[0]!.feeTotal, "-$50.00")
  assert.equal(parseSavedBillingForEditor(schedule)!.billingTotalFormatted, "$450.00")
  // Total-only row: the old editor (and the lib before the B4 fix) made -$100 a $0 month.
  const totalOnly = [{ monthYear: "July 2026", totalAmount: "-$100.00", feeTotal: "$0.00" }]
  assert.deepEqual(headers(plain(legacyEditorParse(totalOnly, FEES)!.months)), [{ month: "July 2026", media: 0, fee: 0, adserving: 0, production: 0, total: 0 }], "old: credit lost")
  assert.deepEqual(headers(plain(parsePersistedBillingScheduleToMonths(totalOnly)!)), [{ month: "July 2026", media: -10000, fee: 0, adserving: 0, production: 0, total: -10000 }])
  // A credit with a negative fee: media is the rest, and the saved total is kept.
  const withFee = [{ monthYear: "July 2026", totalAmount: "-$110.00", feeTotal: "-$10.00" }]
  assert.deepEqual(headers(plain(parsePersistedBillingScheduleToMonths(withFee)!)), [{ month: "July 2026", media: -10000, fee: -1000, adserving: 0, production: 0, total: -11000 }])
  // A positive total-only row keeps its old floor: media never below 0.
  const floor = [{ monthYear: "July 2026", totalAmount: "$100.00", feeTotal: "$150.00" }]
  assert.deepEqual(plain(parsePersistedBillingScheduleToMonths(floor)), plain(legacyEditorParse(floor, FEES)!.months))
})

test("row 4 (P6): line items with no month media total get it rebuilt from the line items", () => {
  const schedule = [
    { monthYear: "October 2026", feeTotal: "$150.00", totalAmount: "$1,650.00", adservingTechFees: "$0.00", production: "$500.00",
      lineItems: {
        search: [{ id: "billing-search::x1SE1", header1: "Google", header2: "", monthlyAmounts: { "October 2026": 1000, "November 2026": 0 }, totalAmount: 1000 }],
        production: [{ id: "billing-production::x1PROD1", header1: "Prod", header2: "", monthlyAmounts: { "October 2026": 500 }, totalAmount: 500 }],
      } },
  ]
  const legacy = legacyEditorParse(schedule, FEES)!
  const lib = parsePersistedBillingScheduleToMonths(schedule)!
  // Same header cents as the old editor (it inferred media = total - fee - ad serving - production).
  assert.deepEqual(headers(plain(lib)), headers(plain(legacy.months)))
  assert.equal(lib[0]!.mediaTotal, "$1,000.00")
  assert.equal(lib[0]!.mediaCosts.search, "$1,000.00")
  assert.equal(lib[0]!.mediaCosts.production, "$500.00")
  // Rebuilt from the line items, which are kept (the old editor dropped them).
  assert.equal((lib[0]!.lineItems as Record<string, unknown[]>).search!.length, 1)
  assert.equal(legacy.months[0]!.lineItems, undefined)
  // A month that saved its media total keeps it as saved.
  const saved = [{ ...schedule[0]!, mediaTotal: "$999.00" }]
  assert.equal(parsePersistedBillingScheduleToMonths(saved)![0]!.mediaTotal, "$999.00")
  // Missing headers are filled: no fee or totals saved.
  const bare = [{ monthYear: "October 2026", lineItems: { search: [{ id: "a", header1: "", header2: "", monthlyAmounts: { "October 2026": 250 }, totalAmount: 250 }] } }]
  assert.deepEqual(headers(plain(parsePersistedBillingScheduleToMonths(bare)!)), [{ month: "October 2026", media: 25000, fee: 0, adserving: 0, production: 0, total: 25000 }])
})

test("F3 probe cases (documented differences): the editor now reads these as finance does", () => {
  const tv = (amount: unknown) => [{ header1: "A", header2: "B", amount, lineItemId: "x" }]
  const cases: Array<{ name: string; schedule: unknown; legacy: Record<string, unknown>; lib: Record<string, unknown> }> = [
    { name: '"AU$" amount: the lib does not read it (old editor read $1,000)',
      schedule: [{ monthYear: "July 2026", feeTotal: "$10.00", mediaTypes: [{ mediaType: "Television", lineItems: tv("AU$1,000.00") }] }],
      legacy: { media: 100000, fee: 1000, adserving: 0, production: 0, total: 101000 },
      lib: { media: 0, fee: 1000, adserving: 0, production: 0, total: 1000 } },
    { name: "blank adservingTechFees with adServing: the lib reads the blank (old editor fell back to adServing)",
      schedule: [{ monthYear: "July 2026", feeTotal: "$10.00", adservingTechFees: "", adServing: "$40.00", mediaTypes: [{ mediaType: "Television", lineItems: tv("$100.00") }] }],
      legacy: { media: 10000, fee: 1000, adserving: 4000, production: 0, total: 15000 },
      lib: { media: 10000, fee: 1000, adserving: 0, production: 0, total: 11000 } },
    { name: "blank monthYear with month_year: the lib keeps the blank month (old editor used month_year)",
      schedule: [{ monthYear: "", month_year: "July 2026", feeTotal: "$10.00", mediaTypes: [{ mediaType: "Television", lineItems: tv("$100.00") }] }],
      legacy: { month: "July 2026", media: 10000, fee: 1000, adserving: 0, production: 0, total: 11000 },
      lib: { month: "", media: 10000, fee: 1000, adserving: 0, production: 0, total: 11000 } },
    { name: "snake media_types with no line items: the lib reads $0 (old editor used the saved total)",
      schedule: [{ monthYear: "July 2026", totalAmount: "$500.00", media_types: [{ media_type: "Television" }] }],
      legacy: { media: 50000, fee: 0, adserving: 0, production: 0, total: 50000 },
      lib: { media: 0, fee: 0, adserving: 0, production: 0, total: 0 } },
  ]
  for (const c of cases) {
    const month = (h: Record<string, unknown>) => ({ month: "July 2026", ...h })
    assert.deepEqual(headers(plain(legacyEditorParse(c.schedule, FEES)!.months)), [month(c.legacy)], `${c.name} (old)`)
    assert.deepEqual(headers(plain(parsePersistedBillingScheduleToMonths(c.schedule)!)), [month(c.lib)], c.name)
  }
})

test("the edit page reads saved billing through the lib parser only", async () => {
  const { readFileSync } = await import("node:fs")
  const src = readFileSync("app/mediaplans/mba/[mba_number]/edit/page.tsx", "utf8")
  assert.match(src, /parseSavedBillingForEditor\(rawBillingSchedule\)/)
  assert.doesNotMatch(src, /function parseSavedBillingSchedulePayload|legacyMonthFeeFromNetMedia|feeSearchRef/)
})
