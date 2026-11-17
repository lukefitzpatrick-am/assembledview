/** B49 (S31): fixed Melbourne times for three jobs, both UTC slots in vercel.json. */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"

import { isMelbourneCronHour, MELBOURNE_CRONS } from "../melbourneCrons"

const vercel = JSON.parse(readFileSync(path.join(process.cwd(), "vercel.json"), "utf8")) as {
  crons: Array<{ path: string; schedule: string }>
}

test("vercel.json holds the AEDT (UTC+11) and AEST (UTC+10) slot for every fixed-Melbourne cron", () => {
  for (const { path: cronPath, melbourneTime } of MELBOURNE_CRONS) {
    const rows = vercel.crons.filter((c) => c.path === cronPath)
    assert.equal(rows.length, 1, `${cronPath}: one vercel.json entry`)
    const [minute, hours] = rows[0]!.schedule.split(" ")
    const [hh, mm] = melbourneTime.split(":").map(Number)
    assert.equal(Number(minute), mm, `${cronPath}: minute`)
    const want = [(hh! - 11 + 24) % 24, (hh! - 10 + 24) % 24].sort((a, b) => a - b)
    assert.deepEqual(hours!.split(",").map(Number).sort((a, b) => a - b), want, `${cronPath}: UTC hours`)
  }
})

test("only the run in the declared Melbourne hour acts, in AEDT and AEST", () => {
  const cases: Array<[Parameters<typeof isMelbourneCronHour>[0], string, boolean]> = [
    ["/api/cron/codex-notifications", "2026-11-12T21:30:00Z", true], // AEDT 08:30
    ["/api/cron/codex-notifications", "2026-11-12T22:30:00Z", false], // AEDT 09:30
    ["/api/cron/codex-notifications", "2026-06-15T22:30:00Z", true], // AEST 08:30
    ["/api/cron/codex-notifications", "2026-06-15T21:30:00Z", false], // AEST 07:30
    ["/api/cron/pacing-portfolio", "2026-11-30T21:00:00Z", true], // AEDT 08:00 on 1 Dec
    ["/api/cron/pacing-portfolio", "2026-11-30T22:00:00Z", false], // AEDT 09:00
    ["/api/cron/pacing-portfolio", "2026-06-15T22:00:00Z", true], // AEST 08:00
    ["/api/cron/pacing-portfolio", "2026-06-15T21:00:00Z", false], // AEST 07:00, today's winter slot
    ["/api/cron/pacing-portfolio?retry=1", "2026-11-30T21:30:00Z", true], // AEDT 08:30
    ["/api/cron/pacing-portfolio?retry=1", "2026-06-15T22:30:00Z", true], // AEST 08:30
    ["/api/cron/pacing-portfolio?retry=1", "2026-06-15T21:30:00Z", false], // AEST 07:30
  ]
  for (const [cronPath, at, want] of cases) assert.equal(isMelbourneCronHour(cronPath, new Date(at)), want, `${cronPath} ${at}`)
})

test("the daylight saving change days: exactly one of the two slots acts", () => {
  // DST ends Sun 5 Apr 2026 (03:00 AEDT -> 02:00 AEST); starts Sun 4 Oct 2026 (02:00 AEST -> 03:00 AEDT).
  for (const day of ["2026-04-04", "2026-04-05", "2026-04-06", "2026-10-03", "2026-10-04", "2026-10-05"]) {
    for (const { path: cronPath, melbourneTime } of MELBOURNE_CRONS) {
      const mm = melbourneTime.slice(3)
      const hits = [21, 22].filter((h) => isMelbourneCronHour(cronPath, new Date(`${day}T${h}:${mm}:00Z`)))
      assert.equal(hits.length, 1, `${cronPath} on ${day}`)
    }
  }
})
