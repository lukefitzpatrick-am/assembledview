/**
 * B59 (C-277, S9 A): the material instructions workbook (the MI route and the
 * Ava tool, both server only) prints the Melbourne day as Prepared Date and in
 * its file name, never the UTC day. Runs in UTC, the Vercel zone, with the
 * clock mocked where the UTC day is the day before:
 *   - 30 Nov 2026 21:00Z, 1 Dec 08:00 AEDT;
 *   - 30 Jun 2026 21:00Z, 1 Jul 07:00 AEST.
 */
import assert from "node:assert/strict"
import test from "node:test"

import { miCampaignFromLineItems, miWorkbookFilename } from "@/lib/specs/buildMiWorkbook"

const INSTANTS = [
  { at: "2026-11-30T21:00:00Z", day: "2026-12-01", label: "1 Dec 08:00 AEDT" },
  { at: "2026-06-30T21:00:00Z", day: "2026-07-01", label: "1 Jul 07:00 AEST" },
] as const

test("the process zone is UTC in this file, as on Vercel", () => {
  assert.equal(new Date(Date.UTC(2026, 11, 1)).getHours(), 0)
})

for (const { at, day, label } of INSTANTS) {
  test(`Prepared Date is the Melbourne day (${label})`, (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: Date.parse(at) })
    const campaign = miCampaignFromLineItems("ACME001", { search: [{ campaign_name: " Summer ", client_name: "Acme" }] }, "Luke")
    assert.deepEqual(campaign, { name: "Summer", client: "Acme", prepared_by: "Luke", prepared_date: day })
  })

  test(`the workbook file name carries the Melbourne day (${label})`, (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: Date.parse(at) })
    assert.equal(miWorkbookFilename("Acme", "Summer"), `MI_acme_summer_${day.replaceAll("-", "")}.xlsx`)
  })
}

test("the Ava tool's campaign block has no Prepared By key and falls back to the MBA and Client", () => {
  const campaign = miCampaignFromLineItems("ACME001", { search: [] })
  assert.equal(campaign.name, "ACME001")
  assert.equal(campaign.client, "Client")
  assert.equal("prepared_by" in campaign, false)
})
