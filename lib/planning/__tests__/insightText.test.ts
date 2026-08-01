import assert from "node:assert/strict"
import test from "node:test"

import { summariseInsight } from "../insightText.js"

const SAMPLE = `AUDIENCE: Men 25-49, national. Roy Morgan Single Source.

THE HEADLINE
Audio-first reach beats a TV-led habit for this cell.

WHAT STANDS OUT
- Finding one with implication.
- Finding two with implication.

REACH ARCHITECTURE
YouTube + radio as the spine.
`

test("summariseInsight reads THE HEADLINE, not the AUDIENCE definition line", () => {
  const s = summariseInsight(SAMPLE)
  assert.equal(s.headline, "Audio-first reach beats a TV-led habit for this cell.")
  assert.notEqual(s.headline?.startsWith("AUDIENCE:"), true)
  assert.equal(s.findings.length, 2)
  assert.match(s.reachArchitecture ?? "", /YouTube/)
})

test("summariseInsight also accepts bare HEADLINE section", () => {
  const s = summariseInsight(`HEADLINE: Short truth.\nWHAT STANDS OUT\n- A`)
  assert.equal(s.headline, "Short truth.")
})
