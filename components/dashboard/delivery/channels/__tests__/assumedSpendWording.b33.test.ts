/**
 * B33 (HF2 review L-C): on the mixed Spend card (assumed lines beside
 * delivered lines) the title tooltip and the KPI band subtitle name the
 * assumed spend too. Wording only: every number on the card and the section
 * is unchanged, and a section without assumed lines is byte-identical to
 * before B33 (JSON pinned at patch 0167, the B32 head).
 *
 * Fixtures follow assumedBesideDelivery.b30.test.ts (Troye PENFOLD020: DV1
 * UMG Popsta assumed, DV2 Channel Factory partner-file rows).
 */
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import test from "node:test"

import { buildDirectDigitalChannelSection } from "../directDigitalAdapterShared"
import type { PacingRow } from "@/lib/snowflake/pacing-service"

type SectionInput = Parameters<typeof buildDirectDigitalChannelSection>[0]
type Section = NonNullable<ReturnType<typeof buildDirectDigitalChannelSection>>
const build = (input: Record<string, unknown>) =>
  buildDirectDigitalChannelSection(input as unknown as SectionInput)

const BURST_START = "2026-10-19T13:00:00.000Z"
const BURST_END = "2026-12-23T13:00:00.000Z"

const PLAN_RATE =
  "Estimated from the plan rate (planned media ÷ planned deliverables), capped at planned media."
const ASSUMED =
  "Includes assumed spend for lines with no delivery: planned media spread evenly across each burst's days, to date."
const ASSUMED_SUBTITLE = " · Spend card includes assumed spend"

function line(id: string, publisher: string, budget: string, cv: number, extra: Record<string, unknown> = {}) {
  return {
    line_item_id: id,
    buy_type: "cpv",
    publisher,
    platform: "",
    no_adserving: true,
    budget_includes_fees: false,
    client_pays_for_media: false,
    fixed_cost_media: false,
    bursts_json: [{ fee: 0, budget, buyAmount: "$0.07", calculatedValue: cv, startDate: BURST_START, endDate: BURST_END }],
    ...extra,
  }
}

const DV1 = line("PENFOLD020DV1", "UMG Popsta", "$20,000.00", 285714)
const DV2 = line("PENFOLD020DV2", "Channel Factory", "$30,000.00", 428571)
const DV2_FIXED = { ...DV2, fixed_cost_media: true }
const DV6 = line("PENFOLD020DV6", "Channel Factory", "$10,000.00", 142857)

function row(channel: PacingRow["channel"], lineItemId: string, dateDay: string, impressions: number, completes: number, clicks = 0): PacingRow {
  return {
    channel,
    dateDay,
    adsetName: null,
    entityName: `ent-${lineItemId}`,
    campaignId: null,
    campaignName: null,
    adsetId: null,
    entityId: `ent-${lineItemId}`,
    lineItemId,
    amountSpent: 0,
    impressions,
    clicks,
    results: 0,
    video3sViews: completes,
    maxFivetranSyncedAt: null,
    updatedAt: null,
  }
}

const CF_ROWS: PacingRow[] = [
  row("programmatic-video", "penfold020dv2", "2026-10-20", 10_000, 7_000),
  row("programmatic-video", "penfold020dv2", "2026-10-21", 12_000, 9_000, 3),
  row("programmatic-video", "penfold020dv2", "2026-11-03", 20_000, 15_000, 5),
]
const DV6_ROWS: PacingRow[] = [row("programmatic-video", "penfold020dv6", "2026-10-22", 5_000, 4_000, 1)]
const REPORTED = new Map([["penfold020dv2", new Map([["2026-10-20", 1_000], ["2026-10-21", 500]])]])

const COMMON = {
  campaignStart: "2026-10-01",
  campaignEnd: "2027-01-04",
  mbaNumber: "PENFOLD020",
  filterRange: { start: null, end: null },
  kpiVersionNumber: 29,
  lineItemTargets: undefined,
  lastSyncedAt: null,
  asOfDate: "2026-11-08",
  pacingAsAtISO: "2026-11-07",
  packageNoUnitTarget: false,
  fixedCostFromDate: false,
}

function troye(lineItems: unknown[], rows: PacingRow[], extra: Record<string, unknown> = {}): Section {
  const section = build({ key: "digital-video", title: "Digital Video", lineItems, combinedRows: rows, ...COMMON, ...extra })
  assert.ok(section)
  return section
}

/** CM360 Display: a counted line with no plan rate, and an assumed line (B30 fixture). */
function displayAssumedOnly(): Section {
  const counted = {
    line_item_id: "MBA009DD1",
    buy_type: "cpm",
    publisher: "News Corp",
    platform: "",
    no_adserving: false,
    budget_includes_fees: false,
    fixed_cost_media: false,
    bursts_json: [{ budget: "$0.00", startDate: BURST_START, endDate: BURST_END }],
  }
  const assumedLine = { ...line("MBA009DD2", "Linkby", "$5,000.00", 0), buy_type: "cpm" }
  const section = build({
    key: "digital-display",
    title: "Digital Display",
    lineItems: [counted, assumedLine],
    combinedRows: [row("ad-serving", "mba009dd1", "2026-10-21", 4_000, 0, 7)],
    ...COMMON,
    mbaNumber: "MBA009",
  })
  assert.ok(section)
  return section
}

/** The section with the two B33 strings taken out: what must not move. */
function withoutWording(section: Section): string {
  const copy = structuredClone(section)
  delete (copy.aggregate.progressCards[0] as { titleTooltip?: string }).titleTooltip
  delete (copy.aggregate.kpiBand as { subtitle?: string }).subtitle
  return JSON.stringify(copy)
}

const sha = (text: string) => createHash("sha256").update(text).digest("hex")

// ---- Mixed: the card holds assumed dollars ----

const MIXED: Array<[string, () => Section, string | undefined, string, string]> = [
  // name, section, tooltip, subtitle, sha256 of the section without the two strings at patch 0167
  [
    "estimated and assumed",
    () => troye([DV1, DV2], CF_ROWS),
    `${PLAN_RATE} ${ASSUMED}`,
    `Spend estimated from the plan rate${ASSUMED_SUBTITLE}`,
    "fa367b75da711b5cd9bff74b6c9c5c61e0764f500a43d90467efd48918f5c2d6",
  ],
  [
    "reported and assumed",
    () => troye([DV1, DV2_FIXED], CF_ROWS, { reportedSpendByLineDate: REPORTED }),
    ASSUMED,
    `Reported spend${ASSUMED_SUBTITLE}`,
    "72ba06ba91191d5c329becf4045a1bb04aeaacfa82061ca76d7c2a2b51bb817e",
  ],
  [
    "reported, estimated and assumed",
    () => troye([DV1, DV2_FIXED, DV6], [...CF_ROWS, ...DV6_ROWS], { reportedSpendByLineDate: REPORTED }),
    `${PLAN_RATE} ${ASSUMED}`,
    `Reported spend${ASSUMED_SUBTITLE}`,
    "72b2c84ea38d975929906161e6235e14dd8e0ad77a4d2f0473267871078a91fe",
  ],
  [
    "assumed beside counts only",
    displayAssumedOnly,
    ASSUMED,
    `CM360 delivery counts${ASSUMED_SUBTITLE}`,
    "38614f316950750b04db36675b51b334b5b5f3e585c8f279c8977782d3b662b5",
  ],
]

for (const [name, make, tooltip, subtitle, pinned] of MIXED) {
  test(`B33: mixed Spend card (${name}) names assumed spend in the tooltip and band subtitle`, () => {
    const section = make()
    const card = section.aggregate.progressCards[0]
    assert.equal(card.title, "Spend")
    assert.match(card.detail ?? "", /includes \$[\d,.]+ assumed spend/)
    assert.equal(card.titleTooltip, tooltip)
    assert.equal(section.aggregate.kpiBand.subtitle, subtitle)
  })

  test(`B33: mixed Spend card (${name}) numbers are unchanged`, () => {
    assert.equal(sha(withoutWording(make())), pinned)
  })
}

// ---- Not mixed: byte-identical (JSON pinned at patch 0167) ----

const UNMIXED: Array<[string, () => Section, string | undefined, string, number, string]> = [
  ["Channel Factory only, estimated", () => troye([DV2], CF_ROWS), PLAN_RATE, "Spend estimated from the plan rate", 5052, "b86ac6186c7ea3f9f6b1e27b50bf811059cacc1fa968f1aef4370f804fffb304"],
  [
    "fixed-cost reported only",
    () => troye([DV2_FIXED], CF_ROWS, { reportedSpendByLineDate: REPORTED }),
    undefined,
    "Reported spend",
    4639,
    "644677ea92c97b8f670f8f989bbb263476187f629e209b53267cbf517a4bdf7e",
  ],
  [
    "reported and estimated, no assumed line",
    () => troye([DV2_FIXED, DV6], [...CF_ROWS, ...DV6_ROWS], { reportedSpendByLineDate: REPORTED }),
    PLAN_RATE,
    "Reported spend",
    7106,
    "8c62ae0a6f25b7403586f1d05e9da3fe3b04660e47e7f5e42948dd051fb76269",
  ],
]

for (const [name, make, tooltip, subtitle, length, pinned] of UNMIXED) {
  test(`B33: ${name} keeps the tooltip and subtitle, byte-identical`, () => {
    const section = make()
    const card = section.aggregate.progressCards[0]
    assert.equal(card.titleTooltip, tooltip)
    assert.equal(section.aggregate.kpiBand.subtitle, subtitle)
    assert.doesNotMatch(JSON.stringify(section), /assumed/i)
    const json = JSON.stringify(section)
    assert.equal(json.length, length, name)
    assert.equal(sha(json), pinned, name)
  })
}
