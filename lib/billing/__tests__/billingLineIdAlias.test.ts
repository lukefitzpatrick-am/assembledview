/**
 * MB-30 (B20): old line-id schemes share an alias key with their current id.
 */
import assert from "node:assert/strict"
import test from "node:test"

import {
  billingLineAliasKey,
  billingLineIdAlias,
  currentLineIdCodeForBillingKey,
} from "@/lib/billing/billingLineIdAlias"

const key = (id: string, mediaKey: string, mbaNumber: string | null = "PGAAUS010") =>
  billingLineAliasKey({ id, mediaKey, mbaNumber })

test("old ML code and the current code share a key (bare and decorated)", () => {
  assert.equal(key("PGAAUS010ML1", "digiDisplay"), "digiDisplay|1")
  assert.equal(key("PGAAUS010DD1", "digiDisplay"), "digiDisplay|1")
  assert.equal(key("billing-digiDisplay::PGAAUS010ML1", "digiDisplay"), "digiDisplay|1")
  assert.equal(key("billing-digiDisplay::PGAAUS010DD1", "digiDisplay"), "digiDisplay|1")
  assert.equal(key("malay003ML8", "ooh", "malay003"), "ooh|8")
  assert.equal(key("malay003OH8", "ooh", "malay003"), "ooh|8")
  assert.equal(key("BOSS001ML1", "progVideo", "BOSS001"), "progVideo|1")
  assert.equal(key("BOSS001PV1", "progVideo", "BOSS001"), "progVideo|1")
})

test("no-code ids (MBA ending in digits) alias to the current code", () => {
  assert.equal(key("PGAAUS0051", "socialMedia", "PGAAUS005"), "socialMedia|1")
  assert.equal(key("PGAAUS005SM1", "socialMedia", "PGAAUS005"), "socialMedia|1")
  assert.equal(key("hema0031", "socialMedia", "hema003"), "socialMedia|1")
  assert.equal(key("hema00312", "socialMedia", "hema003"), "socialMedia|12")
})

test("production -vNNN-pN aliases to PROD<n>; ML and no-code don't apply to production", () => {
  assert.equal(key("PGAAUS010-production-v510-p1", "production"), "production|1")
  assert.equal(key("PGAAUS010PROD1", "production"), "production|1")
  assert.equal(key("billing-production::PGAAUS010-production-v510-p2", "production"), "production|2")
  assert.equal(key("PGAAUS010ML1", "production"), null)
  assert.equal(key("PGAAUS0101", "production"), null)
  assert.equal(key("PGAAUS010-production-v510-p1", "digiDisplay"), null)
})

test("MBA prefix is case-insensitive (hema001 vs HEMA001)", () => {
  assert.equal(key("hema001ML4", "digiDisplay", "HEMA001"), "digiDisplay|4")
  assert.equal(key("HEMA001DD4", "digiDisplay", "hema001"), "digiDisplay|4")
})

test("scheme says which side is old", () => {
  assert.equal(billingLineIdAlias({ id: "hema001ML4", mediaKey: "digiDisplay", mbaNumber: "hema001" })?.scheme, "old")
  assert.equal(billingLineIdAlias({ id: "hema001DD4", mediaKey: "digiDisplay", mbaNumber: "hema001" })?.scheme, "current")
  assert.equal(billingLineIdAlias({ id: "hema0034", mediaKey: "socialMedia", mbaNumber: "hema003" })?.scheme, "old")
  assert.equal(
    billingLineIdAlias({ id: "x-production-v9-p3", mediaKey: "production", mbaNumber: "x" })?.lineNumber,
    3,
  )
})

test("no alias: another channel's code, other MBA, placeholders, template ids, blank MBA, line 0", () => {
  assert.equal(key("PGAAUS010SM1", "digiDisplay"), null)
  assert.equal(key("PGAAUS011DD1", "digiDisplay"), null)
  assert.equal(key("billing-digiDisplay::new-0", "digiDisplay"), null)
  assert.equal(key("digiDisplay-News Corp-RON-0", "digiDisplay"), null)
  assert.equal(key("PGAAUS010DD1", "digiDisplay", ""), null)
  assert.equal(key("PGAAUS010DD1", "digiDisplay", null), null)
  assert.equal(key("PGAAUS010DD0", "digiDisplay"), null)
  assert.equal(key("PGAAUS010", "digiDisplay"), null)
  assert.equal(key("PGAAUS010DD1", ""), null)
})

test("every billing media key has its current code", () => {
  for (const [mk, code] of [
    ["television", "TV"], ["radio", "RA"], ["newspaper", "NP"], ["magazines", "MG"], ["ooh", "OH"],
    ["cinema", "CN"], ["digiDisplay", "DD"], ["digiAudio", "DA"], ["digiVideo", "DV"], ["bvod", "BV"],
    ["integration", "IT"], ["search", "SE"], ["socialMedia", "SM"], ["progDisplay", "PD"],
    ["progVideo", "PV"], ["progBvod", "PB"], ["progAudio", "PA"], ["progOoh", "PO"],
    ["influencers", "IN"], ["production", "PROD"],
  ] as const) {
    assert.equal(currentLineIdCodeForBillingKey(mk), code, mk)
  }
  assert.equal(currentLineIdCodeForBillingKey("unknown"), null)
})

test("unknown media key: ML and no-code still alias; any code with a number is not current", () => {
  assert.equal(key("PGAAUS010ML3", "mystery"), "mystery|3")
  assert.equal(key("PGAAUS010DD3", "mystery"), null)
})

test("B21: form says whether the editor keeps the line number", () => {
  const form = (id: string, mediaKey: string, mbaNumber = "PGAAUS010") =>
    billingLineIdAlias({ id, mediaKey, mbaNumber })?.form ?? null
  assert.equal(form("PGAAUS010DD1", "digiDisplay"), "current")
  assert.equal(form("PGAAUS010ML1", "digiDisplay"), "ml")
  assert.equal(form("PGAAUS0051", "socialMedia", "PGAAUS005"), "noCode")
  assert.equal(form("PGAAUS010-production-v510-p1", "production"), "productionOld")
  assert.equal(form("PGAAUS010PROD1", "production"), "current")
  assert.equal(billingLineIdAlias({ id: "PGAAUS010ML1", mediaKey: "digiDisplay", mbaNumber: "PGAAUS010" })?.scheme, "old")
  assert.equal(billingLineIdAlias({ id: "PGAAUS0051", mediaKey: "socialMedia", mbaNumber: "PGAAUS005" })?.scheme, "old")
})
