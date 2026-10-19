/**
 * AA pack reminders fire on the Melbourne 10th, 15th and 17th.
 * The 10th and 15th stay quiet when nothing is due. A second run the same
 * Melbourne day does not send again.
 */
import assert from "node:assert/strict"
import test from "node:test"

import {
  adminRecipientEmails,
  buildReminderEmail,
  reminderBillingMonth,
  reminderDay,
  runBillingPartnerReminders,
  type ReminderPlan,
} from "@/lib/finance/billingPartner/reminders"

const PAGE = "https://app.example/finance/billing-partner"

function plan(overrides: Partial<ReminderPlan> = {}): ReminderPlan {
  return {
    clientName: "Krusty Krab",
    campaignName: "AV Smoke",
    mbaNumber: "krusty002",
    changeKind: "amended",
    backDated: true,
    ...overrides,
  }
}

test("Melbourne day gating holds across the daylight-saving change", () => {
  // 9 Oct 2026 21:30 UTC is 10 Oct 08:30 AEDT (UTC+11).
  assert.equal(reminderDay(new Date("2026-10-09T21:30:00.000Z")), 10)
  assert.equal(reminderBillingMonth(new Date("2026-10-09T21:30:00.000Z")), "2026-10-01")
  // 9 Jul 2026 21:30 UTC is 10 Jul 07:30 AEST (UTC+10).
  assert.equal(reminderDay(new Date("2026-07-09T21:30:00.000Z")), 10)
  assert.equal(reminderBillingMonth(new Date("2026-07-09T21:30:00.000Z")), "2026-07-01")
  // 4 Apr 2026 21:30 UTC is after the April clock change: 5 Apr 07:30 AEST.
  assert.equal(reminderDay(new Date("2026-04-04T21:30:00.000Z")), null)
  // 9 Apr 2026 21:30 UTC is 10 Apr 07:30 AEST.
  assert.equal(reminderDay(new Date("2026-04-09T21:30:00.000Z")), 10)

  // Midnight boundaries.
  assert.equal(reminderDay(new Date("2026-10-09T12:59:59.000Z")), null)
  assert.equal(reminderDay(new Date("2026-10-09T13:00:00.000Z")), 10)
  assert.equal(reminderDay(new Date("2026-07-09T13:59:59.000Z")), null)
  assert.equal(reminderDay(new Date("2026-07-09T14:00:00.000Z")), 10)

  // 15th and 17th. On the 17th the cycle month stays the current month.
  assert.equal(reminderDay(new Date("2026-10-14T21:30:00.000Z")), 15)
  assert.equal(reminderDay(new Date("2026-10-16T21:30:00.000Z")), 17)
  assert.equal(reminderBillingMonth(new Date("2026-10-16T21:30:00.000Z")), "2026-10-01")
  assert.equal(reminderDay(new Date("2026-07-16T21:30:00.000Z")), 17)
  assert.equal(reminderBillingMonth(new Date("2026-07-16T21:30:00.000Z")), "2026-07-01")
  assert.equal(reminderDay(new Date("2026-10-10T21:30:00.000Z")), null)
})

test("admin recipients are the Auth0 admin-role emails", () => {
  assert.deepEqual(
    adminRecipientEmails([
      { email: "Luke.Fitzpatrick@assembledmedia.com.au" },
      { email: "  " },
      { email: "luke.fitzpatrick@assembledmedia.com.au" },
      {},
      { email: "ava@assembledmedia.com.au" },
    ]),
    ["luke.fitzpatrick@assembledmedia.com.au", "ava@assembledmedia.com.au"],
  )
})

test("the 10th and 15th email the due list and stay quiet when it is empty", () => {
  const listed = buildReminderEmail({
    day: 10,
    plans: [plan(), plan({ clientName: "Hema", campaignName: "Always on", mbaNumber: "hema007", changeKind: "new", backDated: false })],
    packs: [],
    pageUrl: PAGE,
  })
  assert.equal(listed?.subject, "AA plans due by the 17th: 2 outstanding")
  assert.match(listed?.text ?? "", /Krusty Krab — AV Smoke — krusty002 — Amended — back-dated/)
  assert.match(listed?.text ?? "", /Hema — Always on — hema007 — New/)
  assert.match(listed?.text ?? "", /https:\/\/app\.example\/finance\/billing-partner/)
  assert.equal(buildReminderEmail({ day: 15, plans: [], packs: [], pageUrl: PAGE }), null)
})

test("the 17th names the pack and still sends when nothing is outstanding", () => {
  const due = buildReminderEmail({
    day: 17,
    plans: [plan({ backDated: false })],
    packs: [{ status: "draft" }, { status: "sent" }],
    pageUrl: PAGE,
  })
  assert.equal(due?.subject, "AA pack due today: 1 plans")
  assert.match(due?.text ?? "", /A pack has been sent for this month/)
  assert.match(due?.text ?? "", /Krusty Krab — AV Smoke — krusty002 — Amended/)

  const empty = buildReminderEmail({
    day: 17,
    plans: [],
    packs: [],
    pageUrl: PAGE,
  })
  assert.equal(empty?.subject, "AA pack: nothing outstanding")
  assert.match(empty?.text ?? "", /No pack has been built for this month/)

  const draft = buildReminderEmail({
    day: 17,
    plans: [plan()],
    packs: [{ status: "draft" }],
    pageUrl: PAGE,
  })
  assert.match(draft?.text ?? "", /A pack has been built and is still a draft/)
})

test("a second run on the same Melbourne day does not send again", async () => {
  const sent: string[][] = []
  const recorded: string[] = []
  const months: string[] = []
  const io = {
    now: new Date("2026-10-09T21:30:00.000Z"),
    listDue: async (billingMonth: string) => {
      months.push(billingMonth)
      return [plan()]
    },
    listPacks: async () => [],
    loadRecipients: async () => ["ava@assembledmedia.com.au", "luke@assembledmedia.com.au"],
    alreadySent: async (ymd: string) => recorded.includes(ymd),
    recordSend: async (row: { reminderDate: string }) => {
      recorded.push(row.reminderDate)
    },
    send: async (message: { to: string[]; subject: string }) => {
      sent.push(message.to)
      assert.equal(message.subject, "AA plans due by the 17th: 1 outstanding")
    },
    pageUrl: PAGE,
  }
  const first = await runBillingPartnerReminders(io)
  const second = await runBillingPartnerReminders(io)
  assert.ok("status" in first)
  assert.equal(first.status, "sent")
  assert.deepEqual(sent, [["ava@assembledmedia.com.au", "luke@assembledmedia.com.au"]])
  assert.deepEqual(months, ["2026-10-01"])
  assert.deepEqual(second, { skipped: "already sent" })
})

test("any other Melbourne day does not send", async () => {
  let sends = 0
  const result = await runBillingPartnerReminders({
    now: new Date("2026-10-10T21:30:00.000Z"),
    send: async () => {
      sends += 1
    },
  })
  assert.deepEqual(result, { skipped: "not a reminder day" })
  assert.equal(sends, 0)
})
