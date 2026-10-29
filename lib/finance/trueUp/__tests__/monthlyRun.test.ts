/**
 * T10 monthly true-up run: the Sydney window on the 2nd, the months, one cron
 * run per as-of month, the saved row and the email. No plan writes.
 */
import assert from "node:assert/strict"
import { test } from "node:test"

import { isTrueUpRunWindow, runTrueUpMonthly, type TrueUpRunInsert } from "../monthlyRun"
import { buildTrueUpRunEmail, compactRunRows, trueUpRunMonths } from "../monthlyRunModel"
import { buildTrueUpReport } from "../compute"
import { INVOICES, MATCHED_RECORDS, PLANS, SCHEDULE } from "./fixtures"

const load = async (args: { asOfMonth: string; fromMonth: string }) =>
  buildTrueUpReport({ ...args, plans: PLANS, schedule: SCHEDULE, invoices: INVOICES, matchedRecords: MATCHED_RECORDS })

function withEnv<T>(env: Record<string, string | undefined>, fn: () => Promise<T>): Promise<T> {
  const before: Record<string, string | undefined> = {}
  for (const k of Object.keys(env)) {
    before[k] = process.env[k]
    if (env[k] === undefined) delete process.env[k]
    else process.env[k] = env[k]
  }
  return fn().finally(() => {
    for (const k of Object.keys(before)) {
      if (before[k] === undefined) delete process.env[k]
      else process.env[k] = before[k]
    }
  })
}

test("window: 07:00 Sydney on the 2nd, in daylight saving and standard time", () => {
  // 1 Nov 20:00 UTC = 2 Nov 07:00 AEDT. 1 Nov 21:00 UTC = 08:00 AEDT (outside).
  assert.equal(isTrueUpRunWindow(new Date("2026-11-01T20:00:00Z")), true)
  assert.equal(isTrueUpRunWindow(new Date("2026-11-01T21:00:00Z")), false)
  // 1 Jul 21:00 UTC = 2 Jul 07:00 AEST. 20:00 UTC = 06:00 AEST (outside).
  assert.equal(isTrueUpRunWindow(new Date("2026-07-01T21:00:00Z")), true)
  assert.equal(isTrueUpRunWindow(new Date("2026-07-01T20:00:00Z")), false)
})

test("months: the month just ended, from the start of its financial year", () => {
  assert.deepEqual(trueUpRunMonths(new Date("2026-11-01T20:00:00Z")), { asOfMonth: "2026-10", fromMonth: "2026-07" })
  assert.deepEqual(trueUpRunMonths(new Date("2026-07-01T21:00:00Z")), { asOfMonth: "2026-06", fromMonth: "2025-07" })
  assert.deepEqual(trueUpRunMonths(new Date("2026-11-01T20:00:00Z"), "2026-09"), { asOfMonth: "2026-09", fromMonth: "2026-07" })
  assert.deepEqual(trueUpRunMonths(new Date("2026-11-01T20:00:00Z"), "nope"), { asOfMonth: "2026-10", fromMonth: "2026-07" })
})

test("email: subject counts plans needing action, lists them, links the page, says nothing changed", async () => {
  const report = await load({ asOfMonth: "2026-09", fromMonth: "2026-07" })
  const need = report.rows.filter((r) => ["gap", "ended", "no_invoice", "schedule_incomplete"].includes(r.status))
  const email = buildTrueUpRunEmail(report, { appBaseUrl: "https://av.example", source: "cron" })
  assert.ok(email.subject.startsWith("True-up to September 2026: "))
  if (need.length > 0) assert.ok(email.subject.includes(`${need.length} plan`))
  for (const r of need) assert.ok(email.html.includes(r.mbaNumber))
  assert.ok(email.html.includes("https://av.example/finance/reports/true-up"))
  assert.ok(email.html.includes("Nothing has been changed"))
  assert.equal(/—/.test(email.html + email.subject), false, "no em dashes")
  const compact = compactRunRows(report)
  assert.equal(compact.length, report.rows.length)
  assert.equal("months" in compact[0]!, false)
})

test("cron: off without TRUE_UP_CRON, outside the window it skips, then saves, emails and marks emailed once", async () => {
  const saved: TrueUpRunInsert[] = []
  const sent: Array<{ to: string[]; subject: string }> = []
  const marked: number[] = []
  let alreadySent = false
  const io = {
    load,
    migrationApplied: async () => true,
    alreadySent: async () => alreadySent,
    saveRun: async (row: TrueUpRunInsert) => (saved.push(row), 77),
    markEmailed: async (id: number) => {
      marked.push(id)
      alreadySent = true
    },
    send: async (p: { to: string[]; subject: string; html: string }) => void sent.push(p),
    recipients: ["ops@example.com"],
    appBaseUrl: "https://av.example",
  }
  const inWindow = new Date("2026-10-01T21:00:00Z") // 2 Oct 07:00 AEST (daylight saving starts 4 Oct)
  await withEnv({ TRUE_UP: "true", TRUE_UP_CRON: undefined }, async () => {
    assert.deepEqual(await runTrueUpMonthly({ source: "cron", now: inWindow, io }), { ok: true, skipped: "disabled" })
  })
  await withEnv({ TRUE_UP: "true", TRUE_UP_CRON: "true" }, async () => {
    // The other UTC slot that day is 06:00 Sydney: skipped.
    assert.deepEqual(await runTrueUpMonthly({ source: "cron", now: new Date("2026-10-01T20:00:00Z"), io }), { ok: true, skipped: "outside_window" })
    const outside = await runTrueUpMonthly({ source: "cron", now: new Date("2026-10-05T00:00:00Z"), io })
    assert.deepEqual(outside, { ok: true, skipped: "outside_window" })
    const first = await runTrueUpMonthly({ source: "cron", now: inWindow, io })
    assert.equal(first.ok, true)
    assert.ok("status" in first && first.status === "sent" && first.runId === 77 && first.asOfMonth === "2026-09")
    assert.equal(saved.length, 1)
    assert.equal(saved[0]!.source, "cron")
    assert.equal(saved[0]!.fromMonth, "2026-07")
    assert.deepEqual(sent.map((s) => s.to), [["ops@example.com"]])
    assert.deepEqual(marked, [77])
    const second = await runTrueUpMonthly({ source: "cron", now: inWindow, force: true, io })
    assert.deepEqual(second, { ok: true, skipped: "already_sent", asOfMonth: "2026-09" })
  })
})

test("manual: runs any time with the actor; an email failure keeps the saved run", async () => {
  const saved: TrueUpRunInsert[] = []
  await withEnv({ TRUE_UP: "true", TRUE_UP_CRON: undefined }, async () => {
    const out = await runTrueUpMonthly({
      source: "manual",
      asOfMonth: "2026-09",
      now: new Date("2026-10-15T00:00:00Z"),
      actor: { teamMemberId: 7, name: "Luke" },
      io: {
        load,
        migrationApplied: async () => true,
        saveRun: async (row) => (saved.push(row), 5),
        markEmailed: async () => assert.fail("not marked when the email fails"),
        send: async () => {
          throw new Error("SENDGRID_API_KEY not configured")
        },
        recipients: ["ops@example.com"],
      },
    })
    assert.ok("status" in out && out.status === "saved_not_emailed" && out.emailError === "SENDGRID_API_KEY not configured")
    assert.equal(saved[0]!.createdBy, 7)
    assert.equal(saved[0]!.source, "manual")
  })
  await withEnv({ TRUE_UP: "true" }, async () => {
    const notReady = await runTrueUpMonthly({ source: "manual", io: { migrationApplied: async () => false } })
    assert.deepEqual(notReady, { ok: true, skipped: "not_ready" })
  })
})
