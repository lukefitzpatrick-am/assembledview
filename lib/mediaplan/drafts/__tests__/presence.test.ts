import assert from "node:assert/strict"
import { test } from "node:test"

import {
  PLAN_PRESENCE_FRESH_MS,
  filterFreshPlanPresence,
  formatPlanPresenceBanner,
  presenceDisplayName,
  shouldArmPresenceInterval,
  shouldPiggybackPresenceOnAutosave,
} from "../presence"

const NOW = new Date("2026-09-05T05:00:00.000Z")

test("a row older than 90s is not fresh; 89s is", () => {
  assert.equal(PLAN_PRESENCE_FRESH_MS, 90_000)
  const stale = filterFreshPlanPresence(
    [
      {
        userId: "a@example.com",
        userLabel: "Ada",
        lastSeenAt: new Date(NOW.getTime() - 91_000).toISOString(),
        page: "edit",
      },
    ],
    { excludeUserId: "me@example.com", now: NOW }
  )
  assert.equal(stale.length, 0)

  const fresh = filterFreshPlanPresence(
    [
      {
        userId: "a@example.com",
        userLabel: "Ada",
        lastSeenAt: new Date(NOW.getTime() - 89_000).toISOString(),
        page: "edit",
      },
    ],
    { excludeUserId: "me@example.com", now: NOW }
  )
  assert.equal(fresh.length, 1)
  assert.equal(fresh[0]?.userLabel, "Ada")
})

test("filter excludes the caller even when the row is fresh", () => {
  const rows = filterFreshPlanPresence(
    [
      {
        userId: "me@example.com",
        userLabel: "Me",
        lastSeenAt: NOW.toISOString(),
        page: "edit",
      },
      {
        userId: "other@example.com",
        userLabel: "Other",
        lastSeenAt: NOW.toISOString(),
        page: "edit",
      },
    ],
    { excludeUserId: "me@example.com", now: NOW }
  )
  assert.deepEqual(
    rows.map((r) => r.userId),
    ["other@example.com"]
  )
})

test("presenceDisplayName uses names and never emails", () => {
  assert.equal(presenceDisplayName("Sarah Chen"), "Sarah Chen")
  assert.equal(presenceDisplayName("sarah@assembledmedia.com.au"), "Another editor")
  assert.equal(presenceDisplayName(""), "Another editor")
  assert.equal(presenceDisplayName(null), "Another editor")
})

test("banner copy is muted presence, not a lock", () => {
  const line = formatPlanPresenceBanner(
    [
      {
        userLabel: "Sarah Chen",
        lastSeenAt: new Date(NOW.getTime() - 120_000).toISOString(),
      },
    ],
    NOW
  )
  assert.equal(line, "Sarah Chen also has this campaign open (2 min ago)")
  assert.doesNotMatch(line ?? "", /lock|takeover|email/i)
})

test("banner never prints an email even when the label is one", () => {
  const line = formatPlanPresenceBanner(
    [
      {
        userLabel: "luke@assembledmedia.com.au",
        lastSeenAt: NOW.toISOString(),
      },
    ],
    NOW
  )
  assert.equal(line, "Another editor also has this campaign open (just now)")
  assert.doesNotMatch(line ?? "", /@/)
})

test("two others join with 'and' / 'have'", () => {
  const line = formatPlanPresenceBanner(
    [
      {
        userLabel: "Sarah Chen",
        lastSeenAt: new Date(NOW.getTime() - 60_000).toISOString(),
      },
      {
        userLabel: "Priya Patel",
        lastSeenAt: NOW.toISOString(),
      },
    ],
    NOW
  )
  assert.equal(
    line,
    "Sarah Chen and Priya Patel also have this campaign open (just now)"
  )
})

test("empty others → no banner", () => {
  assert.equal(formatPlanPresenceBanner([], NOW), null)
})

test("presence rides the autosave timeout when it is armed; otherwise starts an interval", () => {
  assert.equal(
    shouldPiggybackPresenceOnAutosave({
      masterId: 42,
      autosaveEnabled: true,
      dirty: true,
    }),
    true
  )
  assert.equal(
    shouldArmPresenceInterval({
      masterId: 42,
      autosaveEnabled: true,
      dirty: true,
    }),
    false
  )

  assert.equal(
    shouldPiggybackPresenceOnAutosave({
      masterId: 42,
      autosaveEnabled: false,
      dirty: true,
    }),
    false
  )
  assert.equal(
    shouldArmPresenceInterval({
      masterId: 42,
      autosaveEnabled: false,
      dirty: false,
    }),
    true
  )

  assert.equal(
    shouldArmPresenceInterval({
      masterId: null,
      autosaveEnabled: false,
      dirty: false,
    }),
    false
  )
})
