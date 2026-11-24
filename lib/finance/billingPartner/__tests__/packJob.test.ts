/**
 * S15: the AA pack job builds the month's draft on the Melbourne 17th, once.
 * The digest-log claim stops a second build; a failed build releases it.
 */
import assert from "node:assert/strict"
import test from "node:test"

import { runBillingPartnerPackJob } from "@/lib/finance/billingPartner/packJob"

// 06:00 UTC on 17 Nov 2026 is 17:00 on the Melbourne 17th (AEDT).
const CRON_RUN = new Date("2026-11-17T06:00:00.000Z")

type Pack = { status: "draft" | "sent"; createdBy: string }

function harness(
  over: { packs?: Pack[]; due?: number[]; buildFails?: boolean; staleClaim?: boolean } = {},
) {
  const claims = new Set<string>()
  const built: { billingMonth: string; createdBy: string }[] = []
  const released: string[] = []
  const takenOver: string[] = []
  const io = {
    now: CRON_RUN,
    switchOn: async () => true,
    listPacks: async () => over.packs ?? [],
    listDue: async () => (over.due ?? [11, 22]).map((versionId) => ({ versionId })),
    claim: async (month: string) => {
      if (claims.has(month)) return false
      claims.add(month)
      return true
    },
    takeOver: async (month: string) => {
      if (!over.staleClaim) return false
      takenOver.push(month)
      return true
    },
    release: async (month: string) => {
      claims.delete(month)
      released.push(month)
    },
    build: async (input: { billingMonth: string; createdBy: string }) => {
      if (over.buildFails) throw new Error("blob down")
      built.push(input)
      return { packId: `pack-${built.length}` }
    },
  }
  return { io, claims, built, released, takenOver }
}

test("the 17th builds one draft for the calendar month, created by the job", async () => {
  const h = harness()
  const result = await runBillingPartnerPackJob(h.io)
  assert.deepEqual(result, { status: "built", billingMonth: "2026-11-01", packId: "pack-1", planCount: 2 })
  assert.deepEqual(h.built, [{ billingMonth: "2026-11-01", createdBy: "billing-partner-pack-job", now: CRON_RUN }])
})

test("a second run for the same month builds nothing", async () => {
  const h = harness()
  await runBillingPartnerPackJob(h.io)
  assert.deepEqual(await runBillingPartnerPackJob(h.io), { skipped: "already built" })
  assert.equal(h.built.length, 1)
})

test("two runs at once build one pack", async () => {
  const h = harness()
  const results = await Promise.all([runBillingPartnerPackJob(h.io), runBillingPartnerPackJob(h.io)])
  assert.equal(h.built.length, 1)
  assert.equal(results.filter((r) => "skipped" in r && r.skipped === "already built").length, 1)
})

test("switch off does nothing at all", async () => {
  const h = harness()
  const result = await runBillingPartnerPackJob({ ...h.io, switchOn: async () => false })
  assert.deepEqual(result, { skipped: "switch off" })
  assert.equal(h.claims.size, 0)
  assert.equal(h.built.length, 0)
})

test("only the Melbourne 17th acts: 17 Nov 13:30 UTC is the 18th there, 16 Nov 13:30 UTC is the 17th", async () => {
  const h = harness()
  assert.deepEqual(
    await runBillingPartnerPackJob({ ...h.io, now: new Date("2026-11-17T13:30:00.000Z") }),
    { skipped: "not the 17th" },
  )
  const built = await runBillingPartnerPackJob({ ...h.io, now: new Date("2026-11-16T13:30:00.000Z") })
  assert.equal("status" in built && built.status, "built")
})

test("a draft built by hand stops the job; a sent pack does not", async () => {
  const waiting = harness({ packs: [{ status: "draft", createdBy: "luke@assembledmedia.com.au" }] })
  assert.deepEqual(await runBillingPartnerPackJob(waiting.io), { skipped: "a draft is waiting" })
  assert.equal(waiting.claims.size, 0)

  const sent = harness({ packs: [{ status: "sent", createdBy: "luke@assembledmedia.com.au" }] })
  const result = await runBillingPartnerPackJob(sent.io)
  assert.equal("status" in result && result.status, "built")
})

test("nothing due builds nothing and records nothing", async () => {
  const h = harness({ due: [] })
  assert.deepEqual(await runBillingPartnerPackJob(h.io), { skipped: "nothing due" })
  assert.equal(h.claims.size, 0)
})

test("a failed build releases the claim so a re-run can try again", async () => {
  const h = harness({ buildFails: true })
  await assert.rejects(runBillingPartnerPackJob(h.io), /blob down/)
  assert.deepEqual(h.released, ["2026-11-01"])
  assert.equal(h.claims.size, 0)
})

test("a lost claim is taken over when it is stale and the job has no pack for the month", async () => {
  const h = harness({ staleClaim: true })
  h.claims.add("2026-11-01")
  const result = await runBillingPartnerPackJob(h.io)
  assert.equal("status" in result && result.status, "built")
  assert.deepEqual(h.takenOver, ["2026-11-01"])
})

test("a lost claim is never taken over when the job already sent a pack for the month", async () => {
  const h = harness({ staleClaim: true, packs: [{ status: "sent", createdBy: "billing-partner-pack-job" }] })
  h.claims.add("2026-11-01")
  assert.deepEqual(await runBillingPartnerPackJob(h.io), { skipped: "already built" })
  assert.deepEqual(h.takenOver, [])
  assert.equal(h.built.length, 0)
})
