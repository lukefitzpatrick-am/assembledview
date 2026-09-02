/**
 * publisher_profiles config layer — round-trip, grid semantics, legend unmapped.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"
import {
  interpretGridCells,
  isReferenceIgnoreTarget,
  parsePublisherProfile,
  REFERENCE_IGNORE_TARGET,
  resolveLegendStatus,
  serializePublisherProfile,
  sheetIsLineItems,
  unmappedHeaders,
  type PublisherProfileConfig,
} from "../publisherProfileConfig"

const SEED_PATH = path.join(
  process.cwd(),
  "lib/mediaplans/ingest/seeds/publisherProfiles.json",
)

function loadSeeds(): PublisherProfileConfig[] {
  const raw = JSON.parse(readFileSync(SEED_PATH, "utf8")) as unknown[]
  return raw.map((row) => parsePublisherProfile(row))
}

test("four seeded profiles round-trip through the config layer", () => {
  const seeds = loadSeeds()
  assert.equal(seeds.length, 4)
  const names = seeds.map((s) => s.publisher_name).sort()
  assert.deepEqual(names, ["JCDecaux", "QMS", "SCA", "SEN"])

  for (const profile of seeds) {
    const again = parsePublisherProfile(serializePublisherProfile(profile))
    assert.deepEqual(again, profile)
    assert.ok(
      profile.grid_semantics === "status_matrix" ||
        profile.grid_semantics === "count" ||
        profile.grid_semantics === "currency",
    )
  }

  const qms = seeds.find((s) => s.publisher_name === "QMS")!
  const sca = seeds.find((s) => s.publisher_name === "SCA")!
  const jcd = seeds.find((s) => s.publisher_name === "JCDecaux")!
  const sen = seeds.find((s) => s.publisher_name === "SEN")!

  assert.equal(qms.grid_semantics, "status_matrix")
  assert.equal(sca.grid_semantics, "count")
  assert.equal(jcd.grid_semantics, "status_matrix")
  assert.equal(sen.grid_semantics, "count")
  assert.equal(sen.media_type, "radio")
  for (const profile of seeds) {
    assert.equal(
      profile.line_granularity,
      "per_row",
      `${profile.publisher_name} must seed per_row (grouped is config-only, unused)`,
    )
  }

  assert.equal(sheetIsLineItems(qms, "QMS_2026_Paid"), true)
  assert.equal(sheetIsLineItems(qms, "QMS_2026_Bonus"), true)
  assert.equal(sheetIsLineItems(qms, "Campaign MOVE Summary"), false)

  assert.equal(sheetIsLineItems(sca, "Boss Engineering"), true)
  assert.equal(sheetIsLineItems(sca, "R+F"), false)
  assert.equal(sheetIsLineItems(sca, "Reach & Frequency"), false)

  assert.equal(sheetIsLineItems(sen, "OPTION 2"), true)
})

test("count vs status_matrix produce different burst outputs from the same grid", () => {
  const seeds = loadSeeds()
  const statusProfile = seeds.find((s) => s.publisher_name === "QMS")!
  const countProfile = seeds.find((s) => s.publisher_name === "SCA")!

  const cells = ["B", "3", "p", "ZZ"]
  const statusOut = interpretGridCells(statusProfile, cells)
  const countOut = interpretGridCells(countProfile, cells)

  assert.notDeepEqual(statusOut, countOut)

  assert.equal(statusOut[0]!.booking_status, "bonus")
  assert.equal(statusOut[0]!.present, true)
  assert.equal(statusOut[0]!.quantity, null)

  assert.equal(countOut[0]!.booking_status, "unmapped")
  assert.equal(countOut[0]!.quantity, null)

  assert.equal(statusOut[1]!.booking_status, "unmapped")
  assert.equal(countOut[1]!.booking_status, "paid")
  assert.equal(countOut[1]!.quantity, 3)

  assert.equal(statusOut[2]!.booking_status, "paid")
  assert.equal(countOut[2]!.booking_status, "unmapped")
})

test("unknown legend letter surfaces as unmapped rather than defaulting to paid", () => {
  const qms = loadSeeds().find((s) => s.publisher_name === "QMS")!
  assert.equal(resolveLegendStatus(qms.legend_map, "ZZ"), "unmapped")
  assert.equal(resolveLegendStatus(qms.legend_map, "paid"), "unmapped")
  assert.notEqual(resolveLegendStatus(qms.legend_map, "ZZ"), "paid")

  const out = interpretGridCells(qms, ["mystery"])[0]!
  assert.equal(out.booking_status, "unmapped")
  assert.equal(out.present, false)
})

test("fixture descriptor headers: report unmapped columns", () => {
  const seeds = loadSeeds()
  const qms = seeds.find((s) => s.publisher_name === "QMS")!
  const jcd = seeds.find((s) => s.publisher_name === "JCDecaux")!
  const sca = seeds.find((s) => s.publisher_name === "SCA")!

  const qmsHeaders = [
    "LATITUDE",
    "LONGITUDE",
    "QMS FORMAT",
    "STATE",
    "SITE NUMBER / NO. OF PANELS",
    "ADDRESS / PACK DETAILS",
    "SUBURB",
    "POSTCODE",
    "DIRECTION",
    "GEOGRAPHY",
    "FORMAT",
    "SIZE",
    "PORTRAIT / LANDSCAPE",
    "DIGITAL SPECS (WxH)",
    "SHARE OF TIME",
    "AD DURATION (SECS)",
    "ILLUMINATION (HOURS)",
    "ILLUMINATION",
    "PANEL EXCLUSIVITY",
    "*WEEKLY MARKET RATE\n(STATIC LF - 4 WEEKS)",
    "PROD",
    "INSTALL",
  ]
  const jcdHeaders = [
    "Panel #",
    "Panel Name",
    "Village Name / Panel Weights",
    "Suburb / Transit Depot",
    "State",
    "Area",
    "Dimensions",
    "Illumination",
    "Digital Operation Hours",
    "Digital Rotation Seconds",
    "Advertiser Share-of-Time",
    "Default Advertiser Share-of-Time",
    "Direction",
    "Lunar \n(4 week) Market Rate",
    "Production Charge",
    "Installation Charge",
  ]
  const scaHeaders = [
    "Media Description",
    "Length",
    "Days",
    "Daypart",
    "Client Total",
    "Market Rate",
    "Market Total",
    "Total Stations",
    "Total Impacts",
    "Client Rate",
  ]
  const sen = seeds.find((s) => s.publisher_name === "SEN")!
  const senHeaders = [
    "MEDIA SCHEDULE (Week commencing Monday)",
    "ENTITLEMENT",
    "LENGTH",
  ]

  const qmsUnmapped = unmappedHeaders(qms, qmsHeaders)
  const jcdUnmapped = unmappedHeaders(jcd, jcdHeaders)
  const scaUnmapped = unmappedHeaders(sca, scaHeaders)
  const senUnmapped = unmappedHeaders(sen, senHeaders)

  assert.ok(qmsUnmapped.includes("PANEL EXCLUSIVITY"))
  assert.ok(!qmsUnmapped.some((h) => h.includes("WEEKLY MARKET RATE")))
  assert.ok(!qmsUnmapped.includes("PROD"))
  assert.ok(!qmsUnmapped.includes("INSTALL"))

  assert.ok(jcdUnmapped.includes("Default Advertiser Share-of-Time"))
  assert.ok(!jcdUnmapped.some((h) => h.includes("Market Rate")))
  assert.ok(!jcdUnmapped.includes("Production Charge"))
  assert.ok(!jcdUnmapped.includes("Installation Charge"))

  assert.deepEqual(scaUnmapped, ["Days"])
  assert.equal(sca.column_map["Market Rate"], REFERENCE_IGNORE_TARGET)
  assert.equal(sca.column_map["Market Total"], REFERENCE_IGNORE_TARGET)
  assert.ok(isReferenceIgnoreTarget(REFERENCE_IGNORE_TARGET))
  assert.equal(isReferenceIgnoreTarget("media_amount:stated"), false)
  assert.deepEqual(senUnmapped, [])

  const senMoneyHeaders = [
    "Casual Value (All Markets)",
    "Total Casual Value",
    "Total Investment",
    "Historica/ Preferred Rate",
    "Preferred Investment",
  ]
  assert.deepEqual(unmappedHeaders(sen, senMoneyHeaders), senMoneyHeaders)
})

test("0049 line_granularity SQL is AUTHOR ONLY and idempotent", () => {
  const sql = readFileSync(
    path.join(
      process.cwd(),
      "db/migrations/0049_publisher_profiles_line_granularity.sql",
    ),
    "utf8",
  )
  assert.match(sql, /AUTHOR ONLY/i)
  assert.match(sql, /ADD COLUMN IF NOT EXISTS line_granularity/i)
  assert.match(sql, /per_row/)
  assert.match(sql, /grouped/)
  assert.match(sql, /SET line_granularity = 'per_row'/i)
  assert.doesNotMatch(sql, /CREATE POLICY|ENABLE ROW LEVEL SECURITY/i)
})

test("0061 field_defaults SQL is AUTHOR ONLY and idempotent", () => {
  const sql = readFileSync(
    path.join(
      process.cwd(),
      "db/migrations/0061_publisher_profile_field_defaults.sql",
    ),
    "utf8",
  )
  assert.match(sql, /AUTHOR ONLY/i)
  assert.match(sql, /ADD COLUMN IF NOT EXISTS field_defaults/i)
  assert.match(sql, /0061_publisher_profile_field_defaults/)
  assert.match(sql, /RAISE NOTICE/)
  assert.match(sql, /publisher_profiles rows/)
  assert.doesNotMatch(sql, /CREATE POLICY|ENABLE ROW LEVEL SECURITY/i)
})

test("field_defaults defaults to empty and round-trips", () => {
  const base = loadSeeds()[0]!
  assert.deepEqual(base.field_defaults, {})
  const withDefault = parsePublisherProfile({
    ...serializePublisherProfile(base),
    field_defaults: { format: "large_format" },
  })
  assert.equal(withDefault.field_defaults.format, "large_format")
  assert.deepEqual(
    parsePublisherProfile(serializePublisherProfile(withDefault)).field_defaults,
    { format: "large_format" },
  )
})

test("line_granularity defaults to per_row; grouped is valid; invalid throws", () => {
  const base = loadSeeds()[0]!
  const omitted = parsePublisherProfile({
    ...serializePublisherProfile(base),
    line_granularity: undefined,
  })
  assert.equal(omitted.line_granularity, "per_row")

  const grouped = parsePublisherProfile({
    ...serializePublisherProfile(base),
    line_granularity: "grouped",
  })
  assert.equal(grouped.line_granularity, "grouped")
  assert.equal(
    parsePublisherProfile(serializePublisherProfile(grouped)).line_granularity,
    "grouped",
  )

  assert.throws(
    () =>
      parsePublisherProfile({
        ...serializePublisherProfile(base),
        line_granularity: "per_panel",
      }),
    /line_granularity/,
  )
})
