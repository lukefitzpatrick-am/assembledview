/**
 * Xero bill cost for the fixed cost margin report: parsing, CF and AA
 * matching, rebate maths, fee and production classification, month
 * assignment, status handling and the billed vs delivered view.
 */

import assert from "node:assert/strict"
import test from "node:test"

import { composeFixedCostMargin, lineFlagLabels, type FixedCostPlanCell } from "../../compose.js"
import {
  addMonths,
  buildCfPlacementMap,
  costBasisForPublisher,
  createBillPublisherResolver,
  createDirectPublisherFor,
} from "../assemble.js"
import { billCostCells, matchBillLines, summariseBillMatches, type BillMatchContext } from "../match.js"
import {
  classifyBillLine,
  exGstCentsOf,
  findKnownMbas,
  firstWeekDate,
  mediaOwnerTextOf,
  parseBill,
  type RawBillRow,
} from "../parse.js"
import {
  AA_REBATE_RATE,
  assignBillLineMonths,
  classifyBillStatus,
  splitRebate,
} from "../policy.js"
import { directSupplierPublisher, supplierKindOf } from "../suppliers.js"
import {
  AA_HEADER_DRAFT_BILL,
  AA_NO_MBA_BILL,
  AA_TRACKING_BILL,
  AA_TV_BILL,
  CF_BILL_AUG,
  CF_FEE_BILL,
  DIRECT_BROADSHEET_BILL,
  KNOWN_MBAS,
  MBA_CLIENTS,
  PLAN_LINES,
  PUBLISHERS,
} from "./fixtures.js"

function parse(bill: RawBillRow) {
  const kind = supplierKindOf(bill.contactName)
  assert.ok(kind, `supplier for ${bill.contactName}`)
  return parseBill(bill, kind)
}

function ctx(over: Partial<BillMatchContext> = {}, publishers = PUBLISHERS): BillMatchContext {
  const resolve = createBillPublisherResolver(publishers)
  return {
    knownMbas: KNOWN_MBAS,
    mbaClients: MBA_CLIENTS,
    planLines: PLAN_LINES,
    cfPlacements: buildCfPlacementMap([
      { placementId: "PL267346", lineItemId: "krusty001pv1" },
      { placementId: "PL267346", lineItemId: "" },
    ]),
    resolveMediaOwner: resolve,
    directPublisherFor: createDirectPublisherFor(resolve),
    ...over,
  }
}

test("policy: 8% AA rebate in one constant; net = gross x 0.92", () => {
  assert.equal(AA_REBATE_RATE, 0.08)
  assert.deepEqual(splitRebate(1_000_000, true), { grossCents: 1_000_000, rebateCents: 80_000, netCents: 920_000 })
  assert.deepEqual(splitRebate(1_551_724, true), { grossCents: 1_551_724, rebateCents: 124_138, netCents: 1_427_586 })
  assert.deepEqual(splitRebate(561_743, false), { grossCents: 561_743, rebateCents: 0, netCents: 561_743 })
})

test("policy: AUTHORISED and PAID count; DRAFT and SUBMITTED pending", () => {
  assert.equal(classifyBillStatus("AUTHORISED"), "counted")
  assert.equal(classifyBillStatus("paid"), "counted")
  assert.equal(classifyBillStatus("DRAFT"), "pending")
  assert.equal(classifyBillStatus("SUBMITTED"), "pending")
  assert.equal(classifyBillStatus("VOIDED"), "ignored")
})

test("policy: billed month is the issue month; delivered month the week date, else the billed month", () => {
  assert.deepEqual(assignBillLineMonths({ issueDate: "2026-09-30", weekDate: "2026-08-23" }), {
    billedMonth: "2026-09",
    deliveredMonth: "2026-08",
  })
  assert.deepEqual(assignBillLineMonths({ issueDate: "2026-09-30", weekDate: null }), {
    billedMonth: "2026-09",
    deliveredMonth: "2026-09",
  })
})

test("parse: ex GST on Inclusive bills, CF IO and placement, fee lines", () => {
  const [line] = parse(CF_BILL_AUG)
  assert.equal(line!.exGstCents, 561_743)
  assert.equal(line!.opId, "OP072970")
  assert.equal(line!.plId, "PL267346")
  assert.equal(line!.kind, "media")
  const [fee] = parse(CF_FEE_BILL)
  assert.equal(fee!.kind, "fee")
  assert.equal(fee!.exGstCents, 30_184)
  assert.equal(exGstCentsOf(100, 10, "Exclusive"), 10_000)
  assert.equal(exGstCentsOf(110, 10, "Inclusive"), 10_000)
})

test("parse: AA media owner, continuation lines inherit it, week dates, header lines skipped", () => {
  const lines = parse(AA_TV_BILL)
  assert.equal(lines.length, 2)
  assert.equal(lines[0]!.mediaOwnerText, "Seven Network")
  assert.equal(lines[1]!.mediaOwnerText, "Seven Network")
  assert.equal(lines[0]!.weekDate, "2026-08-23")
  assert.equal(lines[1]!.weekDate, "2026-09-06")
  assert.deepEqual(lines[0]!.tracking, ["Krusty - Hero FY2027 (KRUSTY001)"])
  const draft = parse(AA_HEADER_DRAFT_BILL)
  assert.equal(draft.length, 1)
  assert.match(draft[0]!.billText, /Purchase Order KRUSTY016/)
  assert.equal(mediaOwnerTextOf("Regional Victoria Weekly Times\n\nWednesday 16/09/2026"), "Weekly Times")
  assert.equal(mediaOwnerTextOf("Sun-Sat 06/09/2026 06:00-00:00"), null)
  assert.equal(firstWeekDate("Saturday08/08/202606:00-11:58 BM30 seconds"), "2026-08-08")
})

test("classify: production, talent, installation and hot read are not media; CF 7.5% is a fee", () => {
  assert.equal(classifyBillLine("National National QMS Produciton/Installation Sunday 02/08/2026"), "production")
  assert.equal(classifyBillLine("National National Nova Production 09/08/2026 Talent"), "production")
  assert.equal(classifyBillLine("Hot Read 06/09/2026"), "production")
  assert.equal(classifyBillLine("National National Multicultural Outdoor Prod"), "production")
  assert.equal(classifyBillLine("Molicare Men/Women7.5% PL231219"), "fee")
  assert.equal(classifyBillLine("National National Seven Network Sun-Sat 23/08/2026"), "media")
})

test("findKnownMbas: invoice numbers, tracking and line-id-shaped tokens", () => {
  assert.deepEqual(findKnownMbas("Krusty Krab | KRUSTY001 | 108215", KNOWN_MBAS), ["krusty001"])
  assert.deepEqual(findKnownMbas("Krusty (krusty010) and KRUSTY016DD4", KNOWN_MBAS), ["krusty010", "krusty016"])
  assert.deepEqual(findKnownMbas("HARTMANN_2026_Skin C25-BOSS-0003", KNOWN_MBAS), [])
})

test("CF: placement id to plan line through the CF file; fee lines kept apart", () => {
  const [m] = matchBillLines(parse(CF_BILL_AUG), ctx())
  assert.equal(m!.state, "matched")
  assert.equal(m!.method, "cf_placement")
  assert.equal(m!.lineItemId, "krusty001pv1")
  assert.equal(m!.mbaNumber, "krusty001")
  assert.equal(m!.billedMonth, "2026-08")
  assert.equal(m!.deliveredMonth, "2026-08")
  assert.equal(m!.netCents, 561_743)
  assert.equal(m!.rebateCents, 0)
  const [fee] = matchBillLines(parse(CF_FEE_BILL), ctx())
  assert.equal(fee!.state, "fee")
  assert.equal(fee!.lineItemId, null)
})

test("CF: unmapped and ambiguous placements, and no CF file", () => {
  const [none] = matchBillLines(parse(CF_BILL_AUG), ctx({ cfPlacements: new Map() }))
  assert.equal(none!.state, "unmatched")
  assert.match(none!.reason, /not in the CF delivery file/)
  const [two] = matchBillLines(
    parse(CF_BILL_AUG),
    ctx({ cfPlacements: new Map([["PL267346", ["krusty001pv1", "krusty001pv2"]]]) })
  )
  assert.equal(two!.state, "ambiguous")
  assert.deepEqual(two!.candidates, ["krusty001pv1", "krusty001pv2"])
  const [down] = matchBillLines(parse(CF_BILL_AUG), ctx({ cfPlacements: null }))
  assert.equal(down!.state, "unmatched")
  assert.match(down!.reason, /could not be read/)
})

test("AA: MBA in the invoice number, media owner alias, month and amount pick the line", () => {
  const [aug, sep] = matchBillLines(parse(AA_TV_BILL), ctx())
  for (const m of [aug!, sep!]) {
    assert.equal(m.state, "matched")
    assert.equal(m.mbaNumber, "krusty001")
    assert.equal(m.mbaSource, "invoice_number")
    assert.equal(m.publisher, "Seven")
    assert.equal(m.lineItemId, "krusty001tv1")
    assert.equal(m.method, "mba_publisher_month_amount")
    assert.equal(m.billedMonth, "2026-09")
  }
  assert.equal(aug!.deliveredMonth, "2026-08")
  assert.equal(aug!.grossCents, 1_551_724)
  assert.equal(aug!.rebateCents, 124_138)
  assert.equal(aug!.netCents, 1_427_586)
})

test("AA: MBA from per-line tracking; month alone never picks a line", () => {
  const [wt, qcl] = matchBillLines(parse(AA_TRACKING_BILL), ctx())
  assert.equal(wt!.mbaNumber, "krusty010")
  assert.equal(wt!.mbaSource, "tracking")
  assert.equal(wt!.publisher, "News Corp")
  assert.equal(wt!.lineItemId, "krusty010np1")
  assert.equal(wt!.inReport, false)
  assert.match(wt!.reason, /not fixed cost/)
  assert.equal(qcl!.lineItemId, "krusty011np2")

  // The Land, 2,184 in the week of 10 Sep: only np2 bills in Sep (2,134), so a
  // month-only rule would pick it. The amount does not fit: ambiguous.
  const theLand: RawBillRow = {
    ...AA_TRACKING_BILL,
    xeroInvoiceId: "aa-land",
    lineItems: [
      {
        Description: "Regional New South Wales The Land\n\nThursday 10/09/2026 Early General News",
        LineAmount: 2184,
        Tracking: [{ Name: "Client/Campaign", Option: "Krusty - FY27 Automotive | KRUSTY011" }],
      },
    ],
  }
  const [land] = matchBillLines(parse(theLand), ctx())
  assert.equal(land!.state, "ambiguous")
  assert.deepEqual(land!.candidates, ["krusty011np2"])
})

test("AA: an amount match takes the line-month once", () => {
  const twice: RawBillRow = {
    ...AA_TRACKING_BILL,
    xeroInvoiceId: "aa-twice",
    lineItems: [1, 2].map(() => ({
      Description: "Regional Queensland Queensland Country Life\n\nThursday 10/09/2026 Early General News",
      LineAmount: 2134,
      Tracking: [{ Name: "Client/Campaign", Option: "Krusty - FY27 Automotive | KRUSTY011" }],
    })),
  }
  const [a, b] = matchBillLines(parse(twice), ctx())
  assert.equal(a!.lineItemId, "krusty011np2")
  assert.equal(b!.state, "ambiguous")
})

test("AA: MBA from the header line; several lines fit, so it goes to the manual list", () => {
  const [m] = matchBillLines(parse(AA_HEADER_DRAFT_BILL), ctx())
  assert.equal(m!.mbaNumber, "krusty016")
  assert.equal(m!.mbaSource, "description")
  assert.equal(m!.state, "ambiguous")
  assert.deepEqual(m!.candidates.sort(), ["krusty016dd2", "krusty016dd4"])
  assert.equal(m!.statusClass, "pending")
})

test("AA: no MBA is unmatched; production lines are classified, not matched", () => {
  const out = matchBillLines(parse(AA_NO_MBA_BILL), ctx())
  assert.equal(out[0]!.state, "unmatched")
  assert.equal(out[0]!.publisher, "Nova")
  assert.match(out[0]!.reason, /No MBA/)
  assert.equal(out[1]!.state, "production")
  assert.equal(out[2]!.state, "production")
  const totals = summariseBillMatches(out)
  assert.equal(totals[0]!.productionCents, 265_000)
  assert.equal(totals[0]!.unmatchedCents, 48_550)
})

test("AA bills match AA publishers only; direct bills match the direct publisher only", () => {
  const listnr: RawBillRow = {
    ...AA_TV_BILL,
    xeroInvoiceId: "aa-listnr",
    lineItems: [{ Description: "National National LISTNR", LineAmount: 1685 }],
  }
  const [l] = matchBillLines(parse(listnr), ctx())
  assert.equal(l!.state, "unmatched")
  assert.match(l!.reason, /Listnr is not an Advertising Associates publisher/)

  const before = matchBillLines(parse(DIRECT_BROADSHEET_BILL), ctx())
  assert.equal(before[0]!.supplierKind, "direct_publisher")
  assert.equal(before[0]!.state, "unmatched")
  assert.match(before[0]!.reason, /no direct publisher set up/)

  const withDirect = [
    ...PUBLISHERS,
    { id: 84, publisher_name: "Broadsheet - AM", publisherid: "Broadsheet - AM", billingagency: "assembled media" },
  ]
  const after = matchBillLines(
    parse(DIRECT_BROADSHEET_BILL),
    ctx(
      {
        planLines: [
          ...PLAN_LINES,
          {
            mbaNumber: "krusty016",
            lineItemId: "krusty016dd9",
            clientId: 53,
            clientName: "Krusty Krab",
            publisher: "Broadsheet - AM",
            billingAgency: "assembled media",
            inReport: true,
            billedByMonth: new Map([["2026-07", 540_000]]),
          },
        ],
      },
      withDirect
    )
  )
  assert.equal(after[0]!.state, "matched")
  assert.equal(after[0]!.lineItemId, "krusty016dd9")
  assert.equal(after[0]!.rebateCents, 0)
  assert.equal(after[1]!.netCents, -60_000)
})

test("direct suppliers (MAR-8): each contact maps to its own - AM publisher, only once it exists", () => {
  const contacts: Array<[string, string]> = [
    ["Broadsheet Media Pty Ltd", "Broadsheet - AM"],
    ["Are Media Pty Ltd (Advertising)", "Are Media - AM"],
    ["Linkby Pty Ltd", "Linkby - AM"],
    ["Leba", "Leba - AM"],
    ["News Pty Limited", "News Corp - AM"],
    ["Nova c/o Polar Mobile Group Inc", "Nova - AM"],
  ]
  const amRows = contacts.map(([, name], i) => ({
    id: 85 + i,
    publisher_name: name,
    publisherid: name,
    billingagency: "assembled media",
  }))
  const before = createDirectPublisherFor(createBillPublisherResolver(PUBLISHERS))
  const after = createDirectPublisherFor(createBillPublisherResolver([...PUBLISHERS, ...amRows]))
  for (const [contact, name] of contacts) {
    assert.equal(supplierKindOf(contact), "direct_publisher", contact)
    assert.equal(directSupplierPublisher(contact), name, contact)
    assert.equal(before(contact), null, `${contact}: no publisher until the SQL runs`)
    assert.deepEqual(after(contact), { name, billingAgency: "assembled media" }, contact)
    assert.equal(costBasisForPublisher({ name, billingAgency: "assembled media" }), "xero_bill", name)
  }
  // AA bill lines naming Nova still resolve to the AA Nova, never "Nova - AM".
  const resolve = createBillPublisherResolver([...PUBLISHERS, ...amRows])
  assert.deepEqual(resolve("NOVA Podcasts"), { name: "Nova", billingAgency: "advertising associates" })
  assert.equal(resolve("News Corp")?.billingAgency, "advertising associates")
})

test("assemble: publisher resolution, cost basis, CF map, month maths", () => {
  const resolve = createBillPublisherResolver(PUBLISHERS)
  assert.equal(resolve("The Herald Sun")?.name, "News Corp")
  assert.equal(resolve("KAYO Digital")?.name, "Foxtel Media")
  assert.equal(resolve("LISTNR")?.billingAgency, "assembled media")
  assert.equal(resolve("Flow FM"), null)
  assert.equal(costBasisForPublisher(resolve("Channel Factory")), "xero_bill")
  assert.equal(costBasisForPublisher(resolve("News Corp")), "xero_bill")
  assert.equal(costBasisForPublisher(resolve("DV360")), "platform")
  assert.equal(costBasisForPublisher({ name: "Broadsheet - AM", billingAgency: "assembled media" }), "xero_bill")
  assert.equal(costBasisForPublisher(null), "platform")
  const map = buildCfPlacementMap([
    { placementId: "pl1", lineItemId: "A" },
    { placementId: "PL1", lineItemId: "a" },
    { placementId: "PL2", lineItemId: "" },
  ])
  assert.deepEqual(map.get("PL1"), ["a"])
  assert.deepEqual(map.get("PL2"), [])
  assert.equal(addMonths("2026-10", 3), "2027-01")
  assert.equal(addMonths("2026-07", -3), "2026-04")
})

function planCell(over: Partial<FixedCostPlanCell>): FixedCostPlanCell {
  return {
    clientId: 53,
    clientName: "Krusty Krab",
    mbaNumber: "KRUSTY001",
    campaignName: "Hero",
    campaignStatus: "booked",
    lineItemId: "KRUSTY001TV1",
    lineName: "",
    publisher: "Seven",
    platform: "",
    channel: "television",
    buyType: "fixed_cost",
    fixedCostMedia: false,
    month: "2026-08",
    basis: "billing",
    amountCents: 0,
    costBasis: "xero_bill",
    ...over,
  }
}

test("compose: bill cost lands in the billed month, net of rebate; timing shows the delivered month", () => {
  const matched = matchBillLines(parse(AA_TV_BILL), ctx())
  const [line] = composeFixedCostMargin({
    plan: [
      planCell({ month: "2026-08", amountCents: 1_551_724 }),
      planCell({ month: "2026-09", amountCents: 13_448_276 }),
      planCell({ month: "2026-08", basis: "delivery", amountCents: 1_551_724 }),
      planCell({ month: "2026-09", basis: "delivery", amountCents: 13_448_276 }),
    ],
    spend: [{ lineItemId: "krusty001tv1", month: "2026-09", source: "Pacing", spendCents: 99, impressions: 1, rowCount: 1 }],
    invoiced: new Set(),
    from: "2026-07",
    to: "2027-06",
    billCosts: billCostCells(matched),
  })
  assert.ok(line)
  assert.equal(line.costBasis, "xero_bill")
  assert.equal(line.costStatus, "reported")
  assert.deepEqual(line.sources, ["Xero bill (Advertising Associates)"])
  const [aug, sep] = line.months
  assert.equal(aug!.month, "2026-08")
  assert.equal(aug!.actualCents, 0)
  assert.equal(sep!.actualCents, 13_800_000)
  assert.equal(sep!.billGrossCents, 15_000_000)
  assert.equal(sep!.billRebateCents, 1_200_000)
  assert.equal(sep!.marginCents, 13_448_276 - 13_800_000)
  // Aug has no bill issued in Aug: no margin that month (not billed minus 0).
  assert.equal(aug!.marginCents, null)
  assert.equal(line.totals.marginCents, 13_448_276 - 13_800_000)
  assert.equal(line.totals.billedWithCostCents, 13_448_276)
  assert.equal(line.totals.billedWithoutCostCents, 1_551_724)
  const [tAug, tSep] = line.timing
  assert.deepEqual(tAug, {
    month: "2026-08",
    costBilledMonthCents: 0,
    costDeliveredMonthCents: 1_427_586,
    costDiffCents: -1_427_586,
    clientBilledCents: 1_551_724,
    clientDeliveryCents: 1_551_724,
    clientDiffCents: 0,
  })
  assert.equal(tSep!.costBilledMonthCents, 13_800_000)
  assert.equal(tSep!.costDeliveredMonthCents, 12_372_414)
  assert.equal(line.billMethods.join(), "mba_publisher_month_amount")
})

test("compose: bill lines with no bill show No bill yet; pending bills are not cost", () => {
  const draftOnly = matchBillLines(
    parse(AA_HEADER_DRAFT_BILL),
    ctx({ planLines: PLAN_LINES.filter((l) => l.lineItemId !== "krusty016dd2") })
  )
  assert.equal(draftOnly[0]!.state, "matched")
  const lines = composeFixedCostMargin({
    plan: [
      planCell({ mbaNumber: "KRUSTY016", lineItemId: "KRUSTY016DD4", publisher: "Broadsheet", amountCents: 735_000 }),
      planCell({ mbaNumber: "KRUSTY020", lineItemId: "KRUSTY020DD1", publisher: "Golf Digest", amountCents: 400_000 }),
    ],
    spend: [],
    invoiced: new Set(),
    from: "2026-07",
    to: "2027-06",
    billCosts: billCostCells(draftOnly),
  })
  const dd4 = lines.find((l) => l.lineItemId === "KRUSTY016DD4")!
  assert.equal(dd4.costStatus, "none")
  assert.equal(dd4.flags.pendingBills, true)
  assert.equal(dd4.months[0]!.actualCents, 0)
  assert.equal(dd4.months[0]!.pendingBillCents, 1_771_000)
  assert.equal(dd4.months[0]!.marginCents, null)
  const golf = lines.find((l) => l.lineItemId === "KRUSTY020DD1")!
  assert.equal(golf.flags.noBillYet, true)
  assert.equal(golf.flags.noPlatformData, false)
  assert.ok(lineFlagLabels(golf).includes("No bill yet"))
})
