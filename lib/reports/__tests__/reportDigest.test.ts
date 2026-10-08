import assert from "node:assert/strict"
import test from "node:test"

import {
  maybeSendMonthlyReportDigest,
  reportDigestRecipients,
  sydneyDigestClock,
  type DigestRunRow,
  type ReportDigestSend,
} from "@/lib/reports/reportDigest"

const APP = "https://app.example.test"

function row(overrides: Partial<DigestRunRow> = {}): DigestRunRow {
  return {
    mbaNumber: "MBA-1",
    status: "generated",
    clientName: "Penfold",
    campaignName: "Always on",
    blobPathname: "exports/reports/MBA-1/deck.pptx",
    skipReason: null,
    error: null,
    ...overrides,
  }
}

function harness(args: {
  now: Date
  rows: DigestRunRow[]
  alreadySent?: boolean
  recipients?: string[]
}) {
  const sent: { to: string[]; subject: string; html: string; attachments?: unknown }[] = []
  const logged: ReportDigestSend[] = []
  let already = args.alreadySent ?? false
  return {
    sent,
    logged,
    run: () =>
      maybeSendMonthlyReportDigest({
        now: args.now,
        appBaseUrl: APP,
        recipients: args.recipients ?? ["reports@assembledmedia.com.au"],
        loadRows: async () => args.rows,
        digestAlreadySent: async () => already,
        send: async (params) => {
          sent.push(params)
        },
        recordSend: async (record) => {
          logged.push(record)
          already = true
        },
      }),
  }
}

test("sends once", async () => {
  const fifthMorning = new Date("2026-01-04T22:00:00.000Z")
  const clock = sydneyDigestClock(fifthMorning)
  assert.equal(clock.day, 5)
  assert.equal(clock.hour < 16, true)

  const box = harness({
    now: fifthMorning,
    rows: [
      row(),
      row({
        mbaNumber: "MBA-2",
        clientName: "Acme",
        campaignName: "Launch",
        status: "skipped",
        blobPathname: null,
        skipReason: "No delivery reported for this period.",
      }),
    ],
  })

  const first = await box.run()
  const second = await box.run()

  assert.equal(first.sent, true)
  assert.equal(second.sent, false)
  if (!second.sent) assert.equal(second.reason, "already_sent")
  assert.equal(box.sent.length, 1)
  assert.equal(box.sent[0]?.subject, "Monthly campaign reports: December 2025")
  assert.equal(box.sent[0]?.attachments, undefined)
  assert.match(box.sent[0]?.html ?? "", /1 generated, 1 skipped, 0 failed/)
  assert.match(box.sent[0]?.html ?? "", /Penfold/)
  assert.match(box.sent[0]?.html ?? "", /Always on/)
  assert.match(box.sent[0]?.html ?? "", /No delivery reported for this period\./)
  assert.match(
    box.sent[0]?.html ?? "",
    /https:\/\/app\.example\.test\/api\/reports\/download\?path=exports%2Freports%2FMBA-1%2Fdeck\.pptx/,
  )
  assert.equal(box.logged.length, 1)
  assert.equal(box.logged[0]?.periodStart, "2025-12-01")
  assert.equal(box.logged[0]?.runCount, 2)
})

test("never sends with zero rows", async () => {
  const afterDeadline = new Date("2026-01-05T07:00:00.000Z")
  const clock = sydneyDigestClock(afterDeadline)
  assert.equal(clock.day, 5)
  assert.equal(clock.hour >= 16, true)

  const box = harness({ now: afterDeadline, rows: [] })
  const result = await box.run()
  assert.deepEqual(result, { sent: false, reason: "no_rows" })
  assert.equal(box.sent.length, 0)
  assert.equal(box.logged.length, 0)
})

test("not before the queue is empty unless it is past 16:00 on the 5th", async () => {
  const before = new Date("2026-01-05T04:59:00.000Z")
  const atDeadline = new Date("2026-01-05T05:00:00.000Z")
  assert.equal(sydneyDigestClock(before).hour, 15)
  assert.equal(sydneyDigestClock(before).minute, 59)
  assert.equal(sydneyDigestClock(atDeadline).hour, 16)
  assert.equal(sydneyDigestClock(atDeadline).minute, 0)

  const queued = [row({ status: "queued", blobPathname: null })]
  const waiting = harness({ now: before, rows: queued })
  const waitingResult = await waiting.run()
  assert.deepEqual(waitingResult, { sent: false, reason: "still_running" })
  assert.equal(waiting.sent.length, 0)

  const due = harness({ now: atDeadline, rows: queued })
  const dueResult = await due.run()
  assert.equal(dueResult.sent, true)
  assert.equal(due.sent.length, 1)
  assert.match(due.sent[0]?.html ?? "", /1 queued/)

  const idle = harness({
    now: before,
    rows: [row()],
  })
  const idleResult = await idle.run()
  assert.equal(idleResult.sent, true)
})

test("recipients override", () => {
  const fallback = () => ["ops@assembledmedia.com.au"]
  assert.deepEqual(
    reportDigestRecipients(
      { REPORTS_EMAIL_TO: "one@assembledmedia.com.au, two@assembledmedia.com.au" },
      fallback,
    ),
    ["one@assembledmedia.com.au", "two@assembledmedia.com.au"],
  )
  assert.deepEqual(reportDigestRecipients({ REPORTS_EMAIL_TO: "  " }, fallback), [
    "ops@assembledmedia.com.au",
  ])
  assert.deepEqual(reportDigestRecipients({}, fallback), ["ops@assembledmedia.com.au"])
})
