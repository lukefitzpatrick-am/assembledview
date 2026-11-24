import assert from "node:assert/strict"
import test from "node:test"

import { buildTitleClientIndex } from "../../fireflies/titleClients.js"
import { clientAliasRefusal, parseClientNameAliases } from "../clientNameAliases.js"

test("parse: keeps name aliases (no @ needed), trims, drops blanks, non-strings and case repeats", () => {
  assert.deepEqual(parseClientNameAliases([" Go Golfer ", "go golfer", "", 7, null, "PGA_AU_2026"]), ["Go Golfer", "PGA_AU_2026"])
  assert.deepEqual(parseClientNameAliases("PGA"), [])
  assert.deepEqual(parseClientNameAliases(null), [])
})

test("refusal: a generic or short name is refused", () => {
  assert.match(clientAliasRefusal("Prospecting", [], []) ?? "", /no digit or separator/)
  assert.match(clientAliasRefusal("Brand Awareness", [], []) ?? "", /no digit or separator/)
  assert.equal(clientAliasRefusal("PGA_2026", [], []), null)
  assert.match(clientAliasRefusal("PGA_202", [], []) ?? "", /shorter than 8/)
  assert.match(clientAliasRefusal("   ", [], []) ?? "", /no campaign name/)
})

test("refusal: 8 or more characters with a digit or any separator is accepted when nothing clashes", () => {
  for (const name of ["Tour2026", "AU-Tour-", "pga|tour", "pga/tour", "pga.tour", "pga:tour", "pga+tour", "pga#tour", "pga_tour"]) {
    assert.equal(clientAliasRefusal(name, [], []), null, name)
  }
})

// Other clients' title phrases as Fireflies builds them (names, name words, seeds).
const OTHER_PHRASES = buildTitleClientIndex([
  { clientId: 1, displayName: "Hema Maps", mbaidentifier: "hema", aliases: [], isAnchor: false },
  { clientId: 2, displayName: "Penfolds", mbaidentifier: "penf", aliases: [], isAnchor: false },
  { clientId: 3, displayName: "Golf Australia", mbaidentifier: "golf", aliases: [], isAnchor: false },
  { clientId: 4, displayName: "PGA of Australia", mbaidentifier: "pgaaus", aliases: ["PGA_AU_2026"], isAnchor: false },
]).flatMap((e) => e.phrases)

test("refusal: the reviewer's cross-client names clash with another client's phrase once punctuation goes", () => {
  for (const name of ["Hema-Maps", "Penfolds-2026", "PGA-Tour", "Golf-Australia", "pga au 2026!"]) {
    const clash = /clashes with "([^"]+)", another client's name or alias/.exec(clientAliasRefusal(name, [], OTHER_PHRASES) ?? "")?.[1]
    assert.ok(clash && OTHER_PHRASES.includes(clash), name)
  }
  // An alias that sits inside another client's phrase clashes too.
  assert.match(clientAliasRefusal("Australia-2026", [], ["golf australia 2026"]) ?? "", /clashes with "golf australia 2026"/)
  assert.equal(clientAliasRefusal("Boss_Tour_2026", [], OTHER_PHRASES), null)
})

test("refusal: this client's own alias says so, in any spelling; another client's says that", () => {
  assert.equal(clientAliasRefusal("PGA_AU_2026", ["pga au 2026"], []), '"PGA_AU_2026" is already this client\'s alias.')
  assert.equal(
    clientAliasRefusal("Boss-Eng-2026", [], ["boss eng 2026"]),
    '"Boss-Eng-2026" clashes with "boss eng 2026", another client\'s name or alias (meeting titles ignore case and punctuation).',
  )
})
