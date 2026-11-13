import assert from "node:assert/strict"
import { test } from "node:test"

import {
  activeRosterCheck,
  digestEnabled,
  digestSubject,
  dueReminderKind,
  effectiveFollowers,
  groupDigest,
  isDailyJobHour,
  isQuietHours,
  nextFollowReason,
  notificationText,
  recipientsFor,
  reminderDates,
  taskChangeEvents,
  type NotifyFacts,
} from "../notifications"

const A = "actor@x.au"
const facts = (over: Partial<NotifyFacts> = {}): NotifyFacts => ({
  created_by_email: "creator@x.au",
  assignee_email: "assignee@x.au",
  followers: ["creator@x.au", "assignee@x.au", "fan@x.au"],
  canSee: () => true,
  onRoster: () => true,
  ...over,
})
const who = (r: Array<{ email: string; kind: string }>) => r.map((x) => `${x.email}:${x.kind}`)

test("assigned: the new assignee; reassigned: the one taken off it", () => {
  assert.deepEqual(who(recipientsFor({ kind: "assignment", taskId: 1, actor: A, from: null, to: "mia@x.au" }, facts())), ["mia@x.au:assigned"])
  assert.deepEqual(who(recipientsFor({ kind: "assignment", taskId: 1, actor: A, from: "old@x.au", to: "mia@x.au" }, facts())), [
    "mia@x.au:assigned",
    "old@x.au:reassigned",
  ])
  assert.deepEqual(who(recipientsFor({ kind: "assignment", taskId: 1, actor: A, from: "old@x.au", to: null }, facts())), ["old@x.au:reassigned"])
})

test("mentioned beats commented; followers hear about comments", () => {
  const r = recipientsFor({ kind: "comment", taskId: 1, actor: "fan@x.au", mentioned: ["assignee@x.au", "new@x.au"] }, facts())
  assert.deepEqual(who(r), ["assignee@x.au:mentioned", "new@x.au:mentioned", "creator@x.au:commented"])
})

test("due changed, attachment and completed go to followers and the assignee", () => {
  for (const kind of ["due_changed", "attachment_added", "completed"] as const) {
    const r = recipientsFor({ kind, taskId: 1, actor: A }, facts({ followers: ["fan@x.au"] }))
    assert.deepEqual(who(r), [`fan@x.au:${kind}`, `assignee@x.au:${kind}`], kind)
  }
})

test("added as follower goes to the people added", () => {
  assert.deepEqual(who(recipientsFor({ kind: "follower_added", taskId: 1, actor: A, added: ["Mia@X.au"] }, facts())), ["mia@x.au:follower_added"])
})

test("due tomorrow and overdue go to the assignee, else the creator", () => {
  assert.deepEqual(who(recipientsFor({ kind: "overdue", taskId: 1, actor: null }, facts())), ["assignee@x.au:overdue"])
  assert.deepEqual(who(recipientsFor({ kind: "due_tomorrow", taskId: 1, actor: null }, facts({ assignee_email: null }))), [
    "creator@x.au:due_tomorrow",
  ])
  assert.deepEqual(recipientsFor({ kind: "overdue", taskId: 1, actor: null }, facts({ assignee_email: null, created_by_email: null })), [])
})

test("never the actor, for every event", () => {
  const f = facts({ followers: ["me@x.au"], assignee_email: "me@x.au", created_by_email: "me@x.au" })
  const events = [
    { kind: "assignment", taskId: 1, actor: "ME@x.au", from: "me@x.au", to: "me@x.au" },
    { kind: "comment", taskId: 1, actor: "me@x.au", mentioned: ["me@x.au"] },
    { kind: "due_changed", taskId: 1, actor: "me@x.au" },
    { kind: "attachment_added", taskId: 1, actor: "me@x.au" },
    { kind: "follower_added", taskId: 1, actor: "me@x.au", added: ["me@x.au"] },
    { kind: "completed", taskId: 1, actor: "me@x.au" },
  ] as const
  for (const e of events) assert.deepEqual(recipientsFor(e, f), [], e.kind)
})

test("private project: only people who can see it", () => {
  const r = recipientsFor(
    { kind: "comment", taskId: 1, actor: A, mentioned: ["out@x.au"] },
    facts({ canSee: (e) => e !== "out@x.au" && e !== "fan@x.au" }),
  )
  assert.deepEqual(who(r), ["creator@x.au:commented", "assignee@x.au:commented"])
})

test("only active roster members are notified, by primary email (F2)", () => {
  const onRoster = activeRosterCheck([
    { email: "Creator@x.au", name: "C" },
    { email: "fan@x.au", name: "F", aliases: ["fan.alias@x.au"] },
    { email: "gone@x.au", name: "G", active: false },
  ])
  assert.equal(onRoster("creator@x.au"), true, "case does not matter")
  assert.equal(onRoster("fan.alias@x.au"), false, "an alias is not a recipient")
  assert.equal(onRoster("gone@x.au"), false, "someone who left")
  assert.equal(onRoster("stranger@gmail.example"), false)
  const r = recipientsFor(
    { kind: "comment", taskId: 1, actor: A, mentioned: ["stranger@gmail.example"] },
    facts({ followers: ["creator@x.au", "gone@x.au", "fan@x.au"], onRoster }),
  )
  assert.deepEqual(who(r), ["creator@x.au:commented", "fan@x.au:commented"])
  const a = recipientsFor({ kind: "assignment", taskId: 1, actor: A, from: "gone@x.au", to: "contractor@gmail.example" }, facts({ onRoster }))
  assert.deepEqual(a, [], "an assignee or helper stored as sent is not told")
})

test("followers: rows, then creator and assignee unless they unfollowed", () => {
  const f = effectiveFollowers(
    [
      { email: "Fan@x.au", reason: "manual" },
      { email: "creator@x.au", reason: "unfollowed" },
    ],
    { created_by_email: "creator@x.au", assignee_email: "assignee@x.au" },
  )
  assert.deepEqual(f, [
    { email: "assignee@x.au", reason: "implicit_assignee" },
    { email: "fan@x.au", reason: "manual" },
  ])
})

test("follow reasons: first reason kept; unfollow sticks unless someone acts on purpose", () => {
  assert.equal(nextFollowReason(null, "commented"), "commented")
  assert.equal(nextFollowReason("creator", "mentioned"), null)
  assert.equal(nextFollowReason("unfollowed", "creator"), null)
  assert.equal(nextFollowReason("unfollowed", "mentioned"), "mentioned")
  assert.equal(nextFollowReason("unfollowed", "assignee"), "assignee")
  assert.equal(nextFollowReason("manual", "unfollowed"), "unfollowed")
  assert.equal(nextFollowReason("unfollowed", "unfollowed"), null)
})

test("task changes: assignment, due date, completion; a new task only its assignment", () => {
  const base = { id: 4, status: "todo", assignee_email: "a@x.au", due: "2026-11-20" }
  assert.deepEqual(taskChangeEvents(null, { ...base, status: "done" }, A), [{ kind: "assignment", taskId: 4, actor: A, from: null, to: "a@x.au" }])
  assert.deepEqual(taskChangeEvents(null, { ...base, assignee_email: null }, A), [])
  assert.deepEqual(taskChangeEvents(base, { ...base }, A), [])
  assert.deepEqual(
    taskChangeEvents(base, { ...base, assignee_email: "B@x.au", due: null, status: "done" }, A).map((e) => e.kind),
    ["assignment", "due_changed", "completed"],
  )
  assert.deepEqual(taskChangeEvents({ ...base, status: "done" }, { ...base, status: "done" }, A), [])
  assert.deepEqual(taskChangeEvents(base, { ...base, assignee_email: "A@X.AU" }, A), [], "case only is no change")
})

test("quiet hours on the Melbourne clock, both sides of daylight saving", () => {
  // AEDT (UTC+11): 07:59 quiet, 08:00 not, 17:59 not, 18:00 quiet.
  assert.equal(isQuietHours(new Date("2026-11-12T20:59:00Z")), true)
  assert.equal(isQuietHours(new Date("2026-11-12T21:00:00Z")), false)
  assert.equal(isQuietHours(new Date("2026-11-13T06:59:00Z")), false)
  assert.equal(isQuietHours(new Date("2026-11-13T07:00:00Z")), true)
  // AEST (UTC+10): 08:30 Melbourne is 22:30 UTC.
  assert.equal(isQuietHours(new Date("2026-06-15T22:30:00Z")), false)
  assert.equal(isQuietHours(new Date("2026-06-15T21:30:00Z")), true)
  // A day window and an empty window; a bad value falls back.
  assert.equal(isQuietHours(new Date("2026-11-13T01:00:00Z"), "09:00", "17:00"), true)
  assert.equal(isQuietHours(new Date("2026-11-13T01:00:00Z"), "09:00", "09:00"), false)
  assert.equal(isQuietHours(new Date("2026-11-12T20:59:00Z"), "nonsense", "08:00:00"), true)
})

test("daily job: only the cron run in the Melbourne 08:00 hour", () => {
  assert.equal(isDailyJobHour(new Date("2026-11-12T21:30:00Z")), true, "AEDT 08:30")
  assert.equal(isDailyJobHour(new Date("2026-11-12T22:30:00Z")), false, "AEDT 09:30")
  assert.equal(isDailyJobHour(new Date("2026-06-15T22:30:00Z")), true, "AEST 08:30")
  assert.equal(isDailyJobHour(new Date("2026-06-15T21:30:00Z")), false, "AEST 07:30")
})

test("reminder dates use the Melbourne day", () => {
  const now = new Date("2026-11-12T21:30:00Z") // Fri 13 Nov 08:30 Melbourne
  assert.deepEqual(reminderDates(now), { today: "2026-11-13", tomorrow: "2026-11-14", overdueFrom: "2026-11-06", overdueTo: "2026-11-12" })
  assert.equal(dueReminderKind("2026-11-14", now), "due_tomorrow")
  assert.equal(dueReminderKind("2026-11-12", now), "overdue")
  assert.equal(dueReminderKind("2026-11-06", now), "overdue")
  assert.equal(dueReminderKind("2026-11-05", now), null)
  assert.equal(dueReminderKind("2026-11-13", now), null)
  assert.equal(dueReminderKind(null, now), null)
})

test("digest: per person, per task, newest task first, lines in order", () => {
  const rows = [
    { id: 1, recipient_email: "Mia@x.au", kind: "mentioned" as const, task_id: 7, task_title: "Book OOH", actor_name: "Ellie Ward", created_at: "2026-11-12T01:00:00Z" },
    { id: 2, recipient_email: "mia@x.au", kind: "due_changed" as const, task_id: 8, task_title: "Search copy", actor_name: "Josh", created_at: "2026-11-12T02:00:00Z" },
    { id: 3, recipient_email: "mia@x.au", kind: "completed" as const, task_id: 7, task_title: "Book OOH", actor_name: null, created_at: "2026-11-12T00:30:00Z" },
    { id: 4, recipient_email: "ellie@x.au", kind: "overdue" as const, task_id: 9, task_title: "", actor_name: null, created_at: "2026-11-12T00:00:00Z" },
  ]
  const out = groupDigest(rows)
  assert.deepEqual(out.map((d) => d.email), ["ellie@x.au", "mia@x.au"])
  const mia = out[1]!
  assert.deepEqual(mia.notificationIds, [3, 1, 2])
  assert.deepEqual(mia.tasks.map((t) => t.task_id), [8, 7])
  assert.deepEqual(mia.tasks[1]!.lines, ['Someone completed "Book OOH"', 'Ellie Ward mentioned you on "Book OOH"'])
  assert.equal(digestSubject(mia), "Codex: 3 updates on 2 tasks")
  assert.equal(digestSubject(out[0]!), "Codex: 1 update on 1 task")
  assert.equal(out[0]!.tasks[0]!.lines[0], '"Untitled task" is overdue')
})

test("words for every kind; digest on by default", () => {
  assert.equal(notificationText("assigned", "Mia", "T"), 'Mia assigned you "T"')
  assert.equal(notificationText("reassigned", "Mia", "T"), 'Mia reassigned "T" to someone else')
  assert.equal(notificationText("follower_added", "Josh", "T"), 'Josh added you as a follower on "T"')
  assert.equal(notificationText("due_tomorrow", "x", "T"), '"T" is due tomorrow')
  assert.equal(digestEnabled(null), true)
  assert.equal(digestEnabled({}), true)
  assert.equal(digestEnabled({ email_digest: false }), false)
})
