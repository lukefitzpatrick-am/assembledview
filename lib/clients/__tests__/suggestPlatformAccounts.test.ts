import assert from "node:assert/strict"
import test from "node:test"

import {
  advertiserMatchScore,
  formatSuggestionCsv,
  suggestPlatformAccounts,
} from "../suggestPlatformAccounts"

const advertisers = [
  { platform: "cm360" as const, advertiserName: "BOSS Engineering" },
  { platform: "dv360" as const, advertiserName: "Boss Automotive" },
  { platform: "cm360" as const, advertiserName: "Hartmans" },
  { platform: "dv360" as const, advertiserName: "Molicare" },
  { platform: "cm360" as const, advertiserName: "Treasury Wine" },
]

test("Boss keeps the two Boss advertisers and drops an unrelated name", () => {
  const rows = suggestPlatformAccounts(
    [{ clientName: "Boss", mbaidentifier: "boss" }],
    advertisers,
  )
  assert.equal(rows.length, 2)
  assert.deepEqual(
    rows.map((row) => row.advertiserName).sort(),
    ["BOSS Engineering", "Boss Automotive"],
  )
  assert.ok(rows.every((row) => row.mbaidentifier === "boss" && row.score >= 0.9))
})

test("Paul Hartmann suggests Hartmans and not Molicare", () => {
  const rows = suggestPlatformAccounts(
    [{ clientName: "Paul Hartmann", mbaidentifier: "hartm" }],
    advertisers,
  )
  assert.equal(rows[0]?.advertiserName, "Hartmans")
  assert.ok((rows[0]?.score ?? 0) >= 0.8)
  assert.equal(rows.find((row) => row.advertiserName === "Molicare"), undefined)
  assert.equal(rows.find((row) => row.advertiserName === "Treasury Wine"), undefined)
})

test("a client with three strong names keeps the top two", () => {
  const rows = suggestPlatformAccounts(
    [{ clientName: "Boss Engineering Group", mbaidentifier: "boss" }],
    [
      { platform: "cm360", advertiserName: "BOSS Engineering" },
      { platform: "dv360", advertiserName: "Boss Automotive" },
      { platform: "cm360", advertiserName: "Boss Engineering Group" },
    ],
  )
  assert.equal(rows.length, 2)
  assert.equal(rows[0]?.advertiserName, "Boss Engineering Group")
  assert.equal(rows[0]?.score, 1)
})

test("exact squash is 1 and an empty name is 0", () => {
  assert.equal(advertiserMatchScore("  Boss Engineering ", "boss engineering"), 1)
  assert.equal(advertiserMatchScore("   ", "Hartmans"), 0)
})

test("CSV quotes a comma in the client name and prints the score", () => {
  const csv = formatSuggestionCsv([
    {
      clientName: "Boss, Engineering",
      mbaidentifier: "boss",
      platform: "cm360",
      advertiserName: "BOSS Engineering",
      score: 0.92,
    },
  ])
  assert.match(csv, /^client_name,mbaidentifier,platform,advertiser_name,score\n/)
  assert.match(csv, /"Boss, Engineering",boss,cm360,BOSS Engineering,0.920\n/)
})
