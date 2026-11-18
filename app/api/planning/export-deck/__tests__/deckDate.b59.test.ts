/**
 * B59 (C-277, S9 A): the planner deck's "generated" date and its file name
 * carry the Melbourne day, set by the server (the button no longer sends a
 * date in the viewer's zone). The route runs only on the server, so this
 * file runs in UTC with the clock mocked where the UTC day is the day before:
 *   - 30 Nov 2026 21:00Z, 1 Dec 08:00 AEDT;
 *   - 30 Jun 2026 21:00Z, 1 Jul 07:00 AEST.
 */
process.env.TZ = "UTC"

import assert from "node:assert/strict"
import { mock, test } from "node:test"
import { NextRequest } from "next/server"

import { mockModuleSkip } from "@/lib/test/mockModuleHarness"

const INSTANTS = [
  { at: "2026-11-30T21:00:00Z", label: "1 Dec 2026", stamp: "20261201", name: "1 Dec 08:00 AEDT" },
  { at: "2026-06-30T21:00:00Z", label: "1 July 2026", stamp: "20260701", name: "1 Jul 07:00 AEST" },
] as const

const decks: { generatedAtLabel: string }[] = []
if (typeof mock.module === "function") {
  await mock.module("@/lib/requireRole", {
    namedExports: { requireRole: async () => ({ session: { user: { sub: `u-${Math.random()}` } }, roles: ["admin"] }) },
  })
  await mock.module("@/lib/planning/export/buildPlannerDeck", {
    namedExports: {
      buildPlannerDeck: async (input: { generatedAtLabel: string }) => {
        decks.push(input)
        return Buffer.from("pptx")
      },
    },
  })
}

for (const { at, label, stamp, name } of INSTANTS) {
  test(`the deck date and file name are the Melbourne day, whatever the browser sends (${name})`, { skip: mockModuleSkip() }, async (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: Date.parse(at) })
    decks.length = 0
    const { POST } = await import("@/app/api/planning/export-deck/route")
    const res = await POST(
      new NextRequest("http://localhost/api/planning/export-deck", {
        method: "POST",
        body: JSON.stringify({ brief: { clientName: "Client A" }, audiences: [{ name: "A" }], generatedAtLabel: "30/11/2026" }),
      }),
    )
    assert.equal(res.status, 200)
    assert.equal(decks[0]?.generatedAtLabel, label)
    assert.match(res.headers.get("Content-Disposition") ?? "", new RegExp(`-client-a-${stamp}\\.pptx"$`))
  })
}
