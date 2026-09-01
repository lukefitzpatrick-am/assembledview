import { describe, it } from "node:test"
import assert from "node:assert/strict"

import {
  exceptionReasonForMatch,
  matchMbaAgainstMasters,
  tokenizeReference,
  type MbaMaster,
  type ScopeOfWorkRef,
} from "../matchMba"

const masters: MbaMaster[] = [
  { id: 18, mba_number: "PENFOLD018" },
  { id: 23, mba_number: "GOLF023" },
  { id: 15, mba_number: "PGAAUS015" },
  { id: 5, mba_number: "BOSS005" },
  { id: 1, mba_number: "HEMA001" },
]

const scopes: ScopeOfWorkRef[] = [
  { id: 101, scope_id: "legal_sow001" },
  { id: 102, scope_id: "hartm_sow004" },
  { id: 103, scope_id: "GOGOLF_sow004" },
]

describe("tokenizeReference — brackets are separators", () => {
  it("strips round brackets so (PENFOLD018) is one MBA token", () => {
    assert.deepEqual(tokenizeReference("(PENFOLD018)"), ["PENFOLD018"])
  })

  it("strips square and curly brackets the same way", () => {
    assert.deepEqual(tokenizeReference("[PENFOLD018]"), ["PENFOLD018"])
    assert.deepEqual(tokenizeReference("{PENFOLD018}"), ["PENFOLD018"])
  })
})

describe("matchMbaAgainstMasters — bracketed MBA convention", () => {
  it("(PENFOLD018) matches PENFOLD018", () => {
    const r = matchMbaAgainstMasters("(PENFOLD018)", masters, scopes)
    assert.equal(r.matched, true)
    if (r.matched && r.kind === "mba") {
      assert.equal(r.mba_number, "PENFOLD018")
      assert.equal(r.id, 18)
    }
  })

  it("[PENFOLD018] and {PENFOLD018} match too", () => {
    for (const ref of ["[PENFOLD018]", "{PENFOLD018}"]) {
      const r = matchMbaAgainstMasters(ref, masters, scopes)
      assert.equal(r.matched, true)
      if (r.matched && r.kind === "mba") {
        assert.equal(r.mba_number, "PENFOLD018")
      }
    }
  })

  it("matches a production-shaped reference with brackets and a pipe", () => {
    const r = matchMbaAgainstMasters(
      "Penfolds - Grange Hero Burst 1 FY2027 (PENFOLD018) | 1011793",
      masters,
      scopes,
    )
    assert.equal(r.matched, true)
    if (r.matched && r.kind === "mba") {
      assert.equal(r.mba_number, "PENFOLD018")
    }
  })

  it("is case-insensitive both ways: (golf023) and (GOLF023)", () => {
    const lower = matchMbaAgainstMasters("(golf023)", masters, scopes)
    const upper = matchMbaAgainstMasters("(GOLF023)", masters, scopes)
    assert.equal(lower.matched, true)
    assert.equal(upper.matched, true)
    if (lower.matched && lower.kind === "mba") {
      assert.equal(lower.mba_number, "GOLF023")
    }
    if (upper.matched && upper.kind === "mba") {
      assert.equal(upper.mba_number, "GOLF023")
    }
  })

  it("a reference containing two different real MBA numbers is still ambiguous", () => {
    const r = matchMbaAgainstMasters(
      "Campaign (PENFOLD018) (BOSS005)",
      masters,
      scopes,
    )
    assert.equal(r.matched, false)
    if (!r.matched && r.reason === "ambiguous") {
      assert.ok(r.matches.includes("PENFOLD018"))
      assert.ok(r.matches.includes("BOSS005"))
    }
  })

  it("Annual Retainer and Meta Direct Campaigns still return no_match", () => {
    for (const ref of ["Annual Retainer", "Meta Direct Campaigns"]) {
      const r = matchMbaAgainstMasters(ref, masters, scopes)
      assert.equal(r.matched, false)
      if (!r.matched) assert.equal(r.reason, "no_match")
      assert.match(
        exceptionReasonForMatch(ref, r) ?? "",
        /No MBA found in reference/,
      )
    }
  })
})

describe("matchMbaAgainstMasters — scope match class", () => {
  it("legalsuper - SEO Retainer (legal_sow001) resolves as kind sow", () => {
    const r = matchMbaAgainstMasters(
      "legalsuper - SEO Retainer (legal_sow001)",
      masters,
      scopes,
    )
    assert.equal(r.matched, true)
    if (r.matched) {
      assert.equal(r.kind, "sow")
      if (r.kind === "sow") {
        assert.equal(r.scope_id, "legal_sow001")
        assert.equal(r.id, 101)
      }
    }
    assert.equal(exceptionReasonForMatch("legalsuper - SEO Retainer (legal_sow001)", r), null)
  })

  it("Annual SEO Retainer | hartm_sow004 resolves as kind sow (no brackets)", () => {
    const r = matchMbaAgainstMasters(
      "Annual SEO Retainer | hartm_sow004",
      masters,
      scopes,
    )
    assert.equal(r.matched, true)
    if (r.matched && r.kind === "sow") {
      assert.equal(r.scope_id, "hartm_sow004")
    }
    assert.equal(
      exceptionReasonForMatch("Annual SEO Retainer | hartm_sow004", r),
      null,
    )
  })

  it("MBA wins when a reference also contains a scope token", () => {
    const r = matchMbaAgainstMasters(
      "Penfolds (PENFOLD018) (legal_sow001)",
      masters,
      scopes,
    )
    assert.equal(r.matched, true)
    if (r.matched && r.kind === "mba") {
      assert.equal(r.mba_number, "PENFOLD018")
      assert.equal(r.alsoScope?.scope_id, "legal_sow001")
    }
  })
})
