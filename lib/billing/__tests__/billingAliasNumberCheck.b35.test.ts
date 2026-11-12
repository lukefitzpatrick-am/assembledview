/**
 * B35 (MB-40): a no-code or old production billing id pairs with a current id
 * by number only when the loaded lines prove the number. Current-code and `ML`
 * ids pair as before.
 */
import assert from "node:assert/strict"
import test from "node:test"

import { buildBillingAliasNumberCheck } from "@/lib/billing/billingAliasNumberCheck"
import { billingLinePairingAliasKey } from "@/lib/billing/billingLineIdAlias"

const pair = (id: string, mediaKey: string, mba: string, check?: ReturnType<typeof buildBillingAliasNumberCheck>) =>
  billingLinePairingAliasKey({ id, mediaKey, mbaNumber: mba }, check)

test("current-code and ML ids pair by number with no check", () => {
  assert.equal(pair("malay003ML8", "ooh", "malay003"), "ooh|8")
  assert.equal(pair("malay003OH8", "ooh", "malay003"), "ooh|8")
  assert.equal(pair("billing-progVideo::BOSS001ML1", "progVideo", "BOSS001"), "progVideo|1")
})

test("no-code and old production ids never pair without a check", () => {
  assert.equal(pair("PGAAUS0051", "socialMedia", "PGAAUS005"), null)
  assert.equal(pair("PGAAUS010-production-v510-p1", "production", "PGAAUS010"), null)
})

test("billing kept the old id after the lines were re-saved with current ids: proven by the line holding the number", () => {
  // curatif002 v13 shape: billing curatif0024 and curatif0025, lines curatif002SM1..SM5.
  const check = buildBillingAliasNumberCheck(
    {
      socialMedia: [1, 2, 3, 4, 5].map((n) => ({ line_item_id: `curatif002SM${n}`, line_item: n })),
      search: [{ line_item_id: "curatif002SE1", line_item: 1 }],
    },
    "curatif002",
  )
  assert.equal(pair("curatif0024", "socialMedia", "curatif002", check), "socialMedia|4")
  assert.equal(pair("billing-socialMedia::curatif0025", "socialMedia", "curatif002", check), "socialMedia|5")
  // No line asks for 6.
  assert.equal(pair("curatif0026", "socialMedia", "curatif002", check), null)
  // A media key with no loaded lines proves nothing.
  assert.equal(pair("curatif0021", "digiDisplay", "curatif002", check), null)
})

test("the loaded line with that id must be the one line asking for the number", () => {
  const ok = buildBillingAliasNumberCheck(
    { socialMedia: [{ line_item_id: "hema0031", line_item: 1 }, { line_item_id: "hema0032", line_item: 2 }] },
    "hema003",
  )
  assert.equal(pair("hema0031", "socialMedia", "hema003", ok), "socialMedia|1")
  assert.equal(pair("HEMA0032", "socialMedia", "hema003", ok), "socialMedia|2")
  // Renumbered: hema0031 sits at 2 and hema0032 at 1.
  const swapped = buildBillingAliasNumberCheck(
    { socialMedia: [{ line_item_id: "hema0032", line_item: 1 }, { line_item_id: "hema0031", line_item: 2 }] },
    "hema003",
  )
  assert.equal(pair("hema0031", "socialMedia", "hema003", swapped), null)
  assert.equal(pair("hema0032", "socialMedia", "hema003", swapped), null)
  // Two lines ask for the same number: not proven.
  const clash = buildBillingAliasNumberCheck(
    { socialMedia: [{ line_item_id: "hema0031", line_item: 1 }, { line_item_id: "hema003SM1", line_item: 1 }] },
    "hema003",
  )
  assert.equal(pair("hema0031", "socialMedia", "hema003", clash), null)
})

test("a line holding the number by position only (another no-code id) proves nothing for a different old id", () => {
  const check = buildBillingAliasNumberCheck(
    { socialMedia: [{ line_item_id: "hema0039", line_item: 1 }] },
    "hema003",
  )
  assert.equal(pair("hema0031", "socialMedia", "hema003", check), null)
})

test("old production ids: proven when the loaded production line carries the id at that position", () => {
  const check = buildBillingAliasNumberCheck(
    { production: [{ line_item_id: "BICAU001-production-v644-p1", line_item: 1 }] },
    "BICAU001",
  )
  assert.equal(pair("BICAU001-production-v644-p1", "production", "BICAU001", check), "production|1")
  // An older version's production id: the loaded line is another old id, not a kept number.
  assert.equal(pair("BICAU001-production-v510-p1", "production", "BICAU001", check), null)
  // A blank MBA proves nothing.
  const blank = buildBillingAliasNumberCheck({ production: [{ line_item_id: "x-production-v1-p1", line_item: 1 }] }, "")
  assert.equal(pair("BICAU001-production-v644-p1", "production", "BICAU001", blank), null)
})
