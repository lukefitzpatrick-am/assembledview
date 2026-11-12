/**
 * B35 (DQ-5, switch burst_overlap_warning): the page-level overlap warning on
 * the create and edit pages. Warn only; the live shapes are the ones named in
 * the brief (hema008PD2, buxton004DD7, PGAAUS015DD18, BOSS011NP2).
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"

import {
  burstOverlapBuilderIssues,
  burstOverlapRailText,
  findLinesWithOverlappingBursts,
} from "@/lib/mediaplan/burstOverlapLines"

test("lines with overlapping bursts are found per channel, others left out", () => {
  const lines = findLinesWithOverlappingBursts({
    progDisplay: [
      {
        line_item_id: "hema008PD2",
        bursts: [
          { startDate: "2026-12-01", endDate: "2027-01-31" },
          { startDate: "2027-01-01", endDate: "2027-02-28" },
        ],
      },
      { line_item_id: "hema008PD3", bursts: [{ startDate: "2027-01-01", endDate: "2027-01-31" }] },
    ],
    newspaper: [
      {
        line_item_id: "BOSS011NP2",
        // Saved shape (bursts_json string), the same burst twice (live: identical pair).
        bursts_json: JSON.stringify([
          { startDate: "2027-06-01", endDate: "2027-06-30" },
          { startDate: "2027-06-01", endDate: "2027-06-30" },
        ]),
      },
    ],
    digiDisplay: [
      {
        line_item_id: "PGAAUS015DD18",
        // Instants: 31 Oct 13:00Z is 1 Nov in Sydney.
        bursts: [
          { startDate: "2026-10-31T13:00:00.000Z", endDate: "2026-11-29T12:59:59.000Z" },
          { startDate: "2026-11-01", endDate: "2026-11-30" },
        ],
      },
      // Back to back: no overlap.
      {
        line_item_id: "buxton004DD1",
        bursts: [
          { startDate: "2026-03-01", endDate: "2026-03-15" },
          { startDate: "2026-03-16", endDate: "2026-03-31" },
        ],
      },
      // A new line with no id yet.
      { bursts: [{ startDate: "2026-03-01", endDate: "2026-03-20" }, { startDate: "2026-03-16", endDate: "2026-03-31" }] },
    ],
    search: null,
  })
  assert.deepEqual(
    lines.map((l) => [l.channel, l.lineLabel, l.overlaps.length]),
    [
      ["progDisplay", "hema008PD2", 1],
      ["newspaper", "BOSS011NP2", 1],
      ["digiDisplay", "PGAAUS015DD18", 1],
      ["digiDisplay", "digiDisplay line 3", 1],
    ],
  )
  assert.equal(lines[0]!.overlaps[0]!.days, 31)
})

test("builder issues are warnings naming the line and first overlap; the rail counts them", () => {
  const lines = findLinesWithOverlappingBursts({
    digiDisplay: [
      {
        line_item_id: "buxton004DD7",
        bursts: [
          { startDate: "2026-03-16", endDate: "2026-04-15" },
          { startDate: "2026-04-01", endDate: "2026-05-15" },
          { startDate: "2026-05-01", endDate: "2026-06-15" },
          { startDate: "2026-06-01", endDate: "2026-06-30" },
        ],
      },
    ],
  })
  const [issue] = burstOverlapBuilderIssues(lines)
  assert.equal(issue!.severity, "warning")
  assert.equal(issue!.title, "Bursts overlap (buxton004DD7)")
  assert.equal(
    issue!.detail,
    "Bursts 1 and 2 overlap from 1 Apr 2026 to 15 Apr 2026 (15 days). And 2 more overlapping pairs. Check the dates. Does not block save.",
  )
  assert.equal(burstOverlapRailText(lines), "1 line has overlapping bursts (buxton004DD7). Check the dates; saving is not blocked.")
  assert.equal(burstOverlapRailText([]), null)
  const many = ["a", "b", "c", "d", "e"].map((id) => ({ lineLabel: id, channel: "ooh", overlaps: lines[0]!.overlaps }))
  assert.equal(burstOverlapRailText(many), "5 lines have overlapping bursts (a, b, c and 2 more). Check the dates; saving is not blocked.")
  assert.deepEqual(burstOverlapBuilderIssues([]), [])
})

test("twin pages: both read the switch, list the lines in builder issues and on the rail, never as an error", () => {
  for (const file of ["app/mediaplans/create/page.tsx", "app/mediaplans/mba/[mba_number]/edit/page.tsx"]) {
    const page = readFileSync(path.join(process.cwd(), file), "utf8")
    assert.match(page, /const burstOverlapWarningOn = clientFeatureOn\("burst_overlap_warning"\)/, file)
    assert.match(page, /burstOverlapWarningOn\s*\?\s*findLinesWithOverlappingBursts\(\{/, file)
    assert.match(page, /issues\.push\(\.\.\.burstOverlapBuilderIssues\(burstOverlapLines\)\)/, file)
    assert.match(page, /const burstOverlapRail = burstOverlapRailText\(burstOverlapLines\)\n\s+if \(burstOverlapRail\) extraProblemTexts\.push\(burstOverlapRail\)/, file)
    for (const key of ["television", "radio", "newspaper", "magazines", "ooh", "cinema", "digiDisplay", "digiAudio", "digiVideo", "bvod", "integration", "search", "socialMedia", "progDisplay", "progVideo", "progBvod", "progAudio", "progOoh", "influencers", "production"]) {
      const start = page.indexOf("findLinesWithOverlappingBursts({")
      const block = page.slice(start, page.indexOf("})", start))
      assert.match(block, new RegExp(`\\b${key}: \\w+MediaLineItems,`), `${file} ${key}`)
    }
    // Never a save stop: the overlap lines are not read by any save gate.
    assert.doesNotMatch(page, /burstOverlapLines\.length\s*>\s*0\s*\)\s*\{\s*toast/, file)
  }
})
